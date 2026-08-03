import { ChildProcess } from "node:child_process";

import { createBubblewrapSpawn } from "./bubblewrap-sandbox";

describe("createBubblewrapSpawn", () => {
  it("hides the host home and only remounts the selected workspace", () => {
    const spawn = jest.fn(() => ({}) as ChildProcess);
    const sandboxedSpawn = createBubblewrapSpawn(spawn);

    sandboxedSpawn("/usr/bin/true", [], {
      cwd: "/tmp/workspace",
      env: {
        PATH: process.env["PATH"] ?? "",
        SPLINE_AGENT_TOKEN: "agent_secret.value",
        SPLINE_AGENT_ID: "agent-1",
      },
    });

    expect(spawn).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawn.mock.calls[0] as unknown as [
      string,
      string[],
      { env: Record<string, string> },
    ];
    expect(command).toBe("bwrap");
    expect(args).toEqual(
      expect.arrayContaining([
        "--unshare-user",
        "--unshare-pid",
        "--unshare-ipc",
        "--tmpfs",
        "/home",
        "--bind",
        "/tmp/workspace",
        "/tmp/workspace",
        "--setenv",
        "SPLINE_AGENT_TOKEN",
        "agent_secret.value",
      ]),
    );
    expect(args.join(" ")).not.toContain(".config/spline");
    expect(options.env).not.toHaveProperty("SPLINE_AGENT_TOKEN");
  });

  it("rejects a workspace root that would expose the host home", () => {
    const spawn = jest.fn(() => ({}) as ChildProcess);
    const sandboxedSpawn = createBubblewrapSpawn(spawn);

    expect(() =>
      sandboxedSpawn("/usr/bin/true", [], {
        cwd: process.env["HOME"] ?? "/",
        env: { PATH: process.env["PATH"] ?? "", SPLINE_AGENT_ID: "agent-1" },
      }),
    ).toThrow("Unsafe workspace root");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("mounts the workspace read-only for observer agents regardless of provider flags", () => {
    const spawn = jest.fn(() => ({}) as ChildProcess);
    const sandboxedSpawn = createBubblewrapSpawn(spawn);

    sandboxedSpawn("/usr/bin/true", [], {
      cwd: "/tmp/workspace",
      env: {
        PATH: process.env["PATH"] ?? "",
        SPLINE_AGENT_ID: "observer-1",
        SPLINE_AGENT_ROLE: "observer",
      },
    });

    const calls = spawn.mock.calls as unknown as Array<[string, string[]]>;
    const args = calls[0]?.[1] ?? [];
    expect(
      args.some(
        (value, index) =>
          value === "--ro-bind" &&
          args[index + 1] === "/tmp/workspace" &&
          args[index + 2] === "/tmp/workspace",
      ),
    ).toBe(true);
  });
});
