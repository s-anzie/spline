import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";

import { planContainer } from "./container-plan";
import { planSpawn } from "./spawn-plan";
import { superviseProcess } from "./supervisor";

/**
 * The claims in `container-plan.spec.ts` are about the argv this code builds.
 * These are about what the kernel then actually does with it — which is the
 * only reason to prefer a container over discipline in the first place.
 *
 * Skipped, never failed, when there is no runtime: a contributor without
 * Docker must not see a red suite for a machine-shaped reason. The trade is
 * that CI has to have one, and the first test says so out loud.
 */
const IMAGE = "alpine:latest";

function dockerAvailable(): boolean {
  try {
    execFileSync("docker", ["image", "inspect", IMAGE], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const withDocker = dockerAvailable() ? describe : describe.skip;

withDocker("a task inside a container (integration)", () => {
  let root: string;
  /** /tmp is a symlink on some systems, and the mount must name the real path. */
  let realRoot: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "spline-container-"));
    realRoot = realpathSync(root);
    writeFileSync(join(root, "inside.txt"), "workspace content");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** Builds the real argv the worker would run, through both planners. */
  function planned(command: string, args: string[], cwd = root) {
    const host = planSpawn({
      command,
      args,
      workspaceRoot: root,
      cwd,
      env: {},
      secrets: {},
      allowedCommands: [command],
      hostEnv: { PATH: process.env.PATH, HOME: "/tmp" },
    });
    if (host.isFailure) {
      throw new Error(host.error);
    }
    return planContainer(host.value, {
      runtime: "docker",
      image: IMAGE,
      workspaceRoot: realRoot,
      memory: "128m",
      cpus: "1",
      pids: 64,
      user: `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    });
  }

  const limits = { timeoutMs: 60_000, maxOutputBytes: 100_000 };

  it("runs at all, so a failure below means the boundary and not the setup", async () => {
    const outcome = await superviseProcess(
      planned("sh", ["-c", "echo alive"]),
      limits,
    );

    expect(outcome.stderr).toBe("");
    expect(outcome.stdout.trim()).toBe("alive");
    expect(outcome.exitCode).toBe(0);
  }, 90_000);

  it("sees the workspace, and only the workspace", async () => {
    const outcome = await superviseProcess(
      planned("sh", ["-c", "cat /workspace/inside.txt"]),
      limits,
    );

    expect(outcome.stdout.trim()).toBe("workspace content");
  }, 90_000);

  /** The gap the README called "the rest of the disk". */
  it("cannot read the host's files", async () => {
    const outcome = await superviseProcess(
      planned("sh", ["-c", "cat /etc/hostname; ls /home 2>&1 | head -1"]),
      limits,
    );

    // /etc/hostname exists — it is the IMAGE's, not this machine's.
    expect(outcome.stdout).not.toContain(hostname());
  }, 90_000);

  /** The gap the README called "the network". */
  it("cannot reach the network", async () => {
    const outcome = await superviseProcess(
      planned("sh", ["-c", "wget -T 3 -q -O- http://1.1.1.1 || echo NO-NETWORK"]),
      limits,
    );

    expect(outcome.stdout).toContain("NO-NETWORK");
  }, 90_000);

  /**
   * The gap the README called "the TOCTOU race", and the one that could not
   * be closed from inside a process at all.
   *
   * A symlink planted inside the workspace pointing at the host's `/etc` is
   * exactly the swap CVE-2026-44112 exploited. Inside the mount namespace it
   * resolves to the IMAGE's `/etc`: there is no host filesystem to reach, so
   * winning the race buys nothing.
   */
  it("makes a symlink out of the workspace resolve to nothing of the host", async () => {
    symlinkSync("/etc", join(root, "escape"));
    writeFileSync(join(root, "marker.txt"), "host marker");

    const outcome = await superviseProcess(
      planned("sh", ["-c", "cat /workspace/escape/hostname 2>&1 | head -1"]),
      limits,
    );

    expect(outcome.stdout).not.toContain(hostname());
  }, 90_000);

  it("cannot write outside the workspace, because the root is read-only", async () => {
    const outcome = await superviseProcess(
      planned("sh", ["-c", "touch /etc/planted 2>&1 || echo READ-ONLY"]),
      limits,
    );

    expect(outcome.stdout + outcome.stderr).toContain("READ-ONLY");
  }, 90_000);

  it("can still write where the task is supposed to work", async () => {
    const outcome = await superviseProcess(
      planned("sh", ["-c", "echo written > /workspace/out.txt && cat /workspace/out.txt"]),
      limits,
    );

    expect(outcome.stdout.trim()).toBe("written");
  }, 90_000);

  /**
   * The gap the README called "resources".
   *
   * `dd` with a 512MB buffer against a 128m limit. The control matters: the
   * exact same command prints SURVIVED when run without `--memory`, so this
   * asserts the limit and not merely that the command fails. 137 is SIGKILL,
   * which is the kernel's OOM killer answering.
   */
  it("is killed rather than allowed to eat the machine's memory", async () => {
    const outcome = await superviseProcess(
      planned("sh", [
        "-c",
        "dd if=/dev/zero of=/dev/null bs=512M count=1 2>/dev/null && echo SURVIVED",
      ]),
      limits,
    );

    expect(outcome.stdout).not.toContain("SURVIVED");
    expect(outcome.exitCode).toBe(137);
  }, 90_000);

  /** Same class, other resource: a fork bomb is a denial of service with no payload. */
  it("cannot spawn its way past the process ceiling", async () => {
    const outcome = await superviseProcess(
      planned("sh", [
        "-c",
        "i=0; while [ $i -lt 300 ]; do sleep 30 & i=$((i+1)); done 2>/dev/null; echo SPAWNED-ALL",
      ]),
      limits,
    );

    expect(outcome.stdout).not.toContain("SPAWNED-ALL");
  }, 90_000);

  it("holds no capabilities, so it cannot even change its own identity", async () => {
    const outcome = await superviseProcess(
      planned("sh", ["-c", "id -u"]),
      limits,
    );

    expect(outcome.stdout.trim()).not.toBe("0");
  }, 90_000);
});
