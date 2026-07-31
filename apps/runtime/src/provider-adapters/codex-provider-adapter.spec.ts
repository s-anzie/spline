import { EventEmitter } from "node:events";

import { CodexProviderAdapter } from "./codex-provider-adapter";

function createFakeChildProcess() {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: jest.Mock;
  };
  child.pid = 5151;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  return child;
}

describe("CodexProviderAdapter", () => {
  it("spawns the codex CLI in non-interactive exec mode with an argv array, never a shell string", () => {
    const child = createFakeChildProcess();
    const spawn = jest.fn().mockReturnValue(child);
    const adapter = new CodexProviderAdapter(spawn);

    adapter.start({
      prompt: "Do the thing",
      cwd: "/home/bradley/spline/apps/web",
      onOutput: jest.fn(),
      onExit: jest.fn(),
    });

    expect(spawn).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawn.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(command).toBe("codex");
    expect(args).toEqual(["exec", "Do the thing"]);
    expect(options["shell"]).not.toBe(true);
    expect(options["cwd"]).toBe("/home/bradley/spline/apps/web");
  });

  it("never spreads the daemon's own process.env — only PATH/HOME plus caller-provided env", () => {
    const child = createFakeChildProcess();
    const spawn = jest.fn().mockReturnValue(child);
    const adapter = new CodexProviderAdapter(spawn);

    adapter.start({
      prompt: "hello",
      cwd: "/tmp",
      env: { OPENAI_API_KEY: "secret-value" },
      onOutput: jest.fn(),
      onExit: jest.fn(),
    });

    const options = spawn.mock.calls[0]?.[2] as { env: Record<string, string> };
    expect(options.env).toMatchObject({ OPENAI_API_KEY: "secret-value" });
    expect(Object.keys(options.env).sort()).toEqual(
      [...new Set(["HOME", "PATH", "OPENAI_API_KEY"])].sort(),
    );
  });

  it("streams stdout/stderr chunks to onOutput tagged by stream", () => {
    const child = createFakeChildProcess();
    const spawn = jest.fn().mockReturnValue(child);
    const adapter = new CodexProviderAdapter(spawn);
    const onOutput = jest.fn();

    adapter.start({ prompt: "hi", cwd: "/tmp", onOutput, onExit: jest.fn() });
    child.stdout.emit("data", Buffer.from("out chunk"));
    child.stderr.emit("data", Buffer.from("err chunk"));

    expect(onOutput).toHaveBeenNthCalledWith(1, "out chunk", "stdout");
    expect(onOutput).toHaveBeenNthCalledWith(2, "err chunk", "stderr");
  });

  it("reports exit code and signal via onExit", () => {
    const child = createFakeChildProcess();
    const spawn = jest.fn().mockReturnValue(child);
    const adapter = new CodexProviderAdapter(spawn);
    const onExit = jest.fn();

    adapter.start({ prompt: "hi", cwd: "/tmp", onOutput: jest.fn(), onExit });
    child.emit("exit", 1, null);

    expect(onExit).toHaveBeenCalledWith(1, null);
  });

  it("returns a handle exposing the pid and a kill function delegating to the child process", () => {
    const child = createFakeChildProcess();
    const spawn = jest.fn().mockReturnValue(child);
    const adapter = new CodexProviderAdapter(spawn);

    const handle = adapter.start({ prompt: "hi", cwd: "/tmp", onOutput: jest.fn(), onExit: jest.fn() });
    handle.kill("SIGTERM");

    expect(handle.pid).toBe(5151);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("exposes its provider name", () => {
    const adapter = new CodexProviderAdapter(jest.fn());
    expect(adapter.provider).toBe("codex");
  });
});
