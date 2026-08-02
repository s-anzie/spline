import { accessSync, constants, cpSync, existsSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawn as nodeSpawn } from "node:child_process";

import type { SpawnFn } from "./provider-adapter";

function executablePath(command: string, pathValue: string): string {
  if (isAbsolute(command)) return realpathSync(resolve(command));
  for (const directory of pathValue.split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, command);
    try {
      accessSync(candidate, constants.X_OK);
      return realpathSync(candidate);
    } catch {
      // Continue searching PATH.
    }
  }
  throw new Error(`Provider executable not found on PATH: ${command}`);
}

function directoryCreationArgs(path: string): string[] {
  const parts = resolve(path).split("/").filter(Boolean);
  const args: string[] = [];
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    args.push("--dir", current);
  }
  return args;
}

/**
 * Runs provider CLIs in an unprivileged Bubblewrap sandbox. The host home is
 * hidden, so sessions cannot read the runtime vault or another agent's token.
 * Only the selected workspace and the provider's own login state are exposed.
 */
export function createBubblewrapSpawn(spawnFn: SpawnFn = nodeSpawn): SpawnFn {
  return (command, commandArgs, options) => {
    const hostHome = process.env["HOME"] ?? "";
    const workspace = resolve(options.cwd);
    if (
      workspace === "/" ||
      workspace === hostHome ||
      (hostHome && hostHome.startsWith(`${workspace}/`))
    ) {
      throw new Error(
        `Unsafe workspace root for an agent sandbox: ${workspace}. Select a project directory, not the host home or one of its parents.`,
      );
    }
    const binary = executablePath(command, options.env["PATH"] ?? "");
    const binaryRoot = dirname(dirname(binary));
    const sandboxBinaryRoot = "/run/spline-provider";
    const toolkitRoot = resolve(__dirname, "..", "toolkit");
    const sandboxToolkitRoot = "/run/spline-toolkit";
    const nodeBinary = realpathSync(process.execPath);
    const sandboxNodeBinary = "/run/spline-node";
    const sandboxBinary = join(sandboxBinaryRoot, relative(binaryRoot, binary));
    const sandboxHome = "/home/spline-agent";
    const agentId = options.env["SPLINE_AGENT_ID"];
    if (!agentId || !/^[A-Za-z0-9_-]+$/.test(agentId))
      throw new Error("A valid SPLINE_AGENT_ID is required for provider isolation");
    const args = [
      "--unshare-user",
      "--unshare-pid",
      "--unshare-ipc",
      "--unshare-uts",
      "--die-with-parent",
      "--new-session",
      "--ro-bind",
      "/",
      "/",
      "--tmpfs",
      "/home",
      "--tmpfs",
      "/tmp",
      "--tmpfs",
      "/run",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      ...directoryCreationArgs(workspace),
      "--bind",
      workspace,
      workspace,
      ...directoryCreationArgs(sandboxHome),
      ...directoryCreationArgs(sandboxBinaryRoot),
      "--ro-bind",
      binaryRoot,
      sandboxBinaryRoot,
      ...directoryCreationArgs(sandboxToolkitRoot),
      "--ro-bind",
      toolkitRoot,
      sandboxToolkitRoot,
      "--ro-bind",
      nodeBinary,
      sandboxNodeBinary,
    ];

    const providerState =
      command === "claude"
        ? [".claude", ".claude.json"]
        : command === "codex"
          ? [".codex"]
          : [];
    for (const name of providerState) {
      const source = join(hostHome, name);
      if (!existsSync(source)) continue;
      const stateRoot = join(
        hostHome,
        ".local",
        "state",
        "spline",
        "agents",
        agentId,
        command,
      );
      mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
      const isolatedState = join(stateRoot, name);
      if (!existsSync(isolatedState)) {
        if (statSync(source).isDirectory()) {
          mkdirSync(isolatedState, { recursive: true, mode: 0o700 });
          const seedFiles =
            command === "claude"
              ? [".credentials.json", "settings.json"]
              : ["auth.json", "config.toml"];
          for (const seedFile of seedFiles) {
            const seedSource = join(source, seedFile);
            if (existsSync(seedSource))
              cpSync(seedSource, join(isolatedState, seedFile));
          }
        } else {
          cpSync(source, isolatedState);
        }
      }
      const target = join(sandboxHome, name);
      args.push(...directoryCreationArgs(dirname(target)));
      args.push("--bind", isolatedState, target);
    }

    for (const [name, value] of Object.entries(options.env)) {
      args.push("--setenv", name, value);
    }
    args.push("--setenv", "HOME", sandboxHome);
    args.push("--chdir", workspace, "--", sandboxBinary, ...commandArgs);

    return spawnFn("bwrap", args, {
      cwd: workspace,
      env: {
        PATH: process.env["PATH"] ?? "",
        HOME: hostHome,
      },
    });
  };
}
