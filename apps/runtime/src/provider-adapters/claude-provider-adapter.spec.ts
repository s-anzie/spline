import { EventEmitter } from "node:events";

import { ClaudeProviderAdapter } from "./claude-provider-adapter";

function createFakeChildProcess() {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: jest.Mock; end: jest.Mock };
    kill: jest.Mock;
  };
  child.pid = 4242;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: jest.fn(), end: jest.fn() };
  child.kill = jest.fn();
  return child;
}

describe("ClaudeProviderAdapter", () => {
  it("spawns the claude CLI in non-interactive print mode with an argv array, never a shell string", () => {
    const child = createFakeChildProcess();
    const spawn = jest.fn().mockReturnValue(child);
    const adapter = new ClaudeProviderAdapter(spawn);

    adapter.start({
      prompt: "Do the thing",
      cwd: "/home/bradley/spline/apps/web",
      onOutput: jest.fn(),
      onExit: jest.fn(),
    });

    expect(spawn).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawn.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(command).toBe("claude");
    expect(args).toEqual(
      expect.arrayContaining([
        "--print",
        "--output-format",
        "stream-json",
        "--verbose",
        "--session-id",
      ]),
    );
    expect(options["shell"]).not.toBe(true);
    expect(options["cwd"]).toBe("/home/bradley/spline/apps/web");
  });

  it("resumes the exact native Claude session", () => {
    const child = createFakeChildProcess();
    const spawn = jest.fn().mockReturnValue(child);
    const adapter = new ClaudeProviderAdapter(spawn);
    adapter.start({
      prompt: "Continue",
      cwd: "/tmp",
      resumeSessionId: "550e8400-e29b-41d4-a716-446655440000",
      onOutput: jest.fn(),
      onExit: jest.fn(),
    });
    expect(spawn.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([
        "--resume",
        "550e8400-e29b-41d4-a716-446655440000",
      ]),
    );
  });

  it("writes the prompt to the child's stdin and closes it, instead of passing it via argv (ARG_MAX safety for large prompts)", () => {
    const child = createFakeChildProcess();
    const spawn = jest.fn().mockReturnValue(child);
    const adapter = new ClaudeProviderAdapter(spawn);

    adapter.start({ prompt: "Do the thing", cwd: "/tmp", onOutput: jest.fn(), onExit: jest.fn() });

    expect(child.stdin.write).toHaveBeenCalledWith("Do the thing");
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
  });

  it("never spreads the daemon's own process.env — only PATH/HOME plus caller-provided env", () => {
    const child = createFakeChildProcess();
    const spawn = jest.fn().mockReturnValue(child);
    const adapter = new ClaudeProviderAdapter(spawn);

    adapter.start({
      prompt: "hello",
      cwd: "/tmp",
      env: { ANTHROPIC_API_KEY: "secret-value" },
      onOutput: jest.fn(),
      onExit: jest.fn(),
    });

    const options = spawn.mock.calls[0]?.[2] as { env: Record<string, string> };
    expect(options.env).toMatchObject({ ANTHROPIC_API_KEY: "secret-value" });
    expect(Object.keys(options.env).sort()).toEqual(
      [...new Set(["HOME", "PATH", "ANTHROPIC_API_KEY"])].sort(),
    );
  });

  it("streams stdout/stderr chunks to onOutput tagged by stream", () => {
    const child = createFakeChildProcess();
    const spawn = jest.fn().mockReturnValue(child);
    const adapter = new ClaudeProviderAdapter(spawn);
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
    const adapter = new ClaudeProviderAdapter(spawn);
    const onExit = jest.fn();

    adapter.start({ prompt: "hi", cwd: "/tmp", onOutput: jest.fn(), onExit });
    child.emit("exit", 0, null);

    expect(onExit).toHaveBeenCalledWith(0, null);
  });

  it("returns a handle exposing the pid and a kill function delegating to the child process", () => {
    const child = createFakeChildProcess();
    const spawn = jest.fn().mockReturnValue(child);
    const adapter = new ClaudeProviderAdapter(spawn);

    const handle = adapter.start({ prompt: "hi", cwd: "/tmp", onOutput: jest.fn(), onExit: jest.fn() });
    handle.kill("SIGTERM");

    expect(handle.pid).toBe(4242);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("exposes its provider name", () => {
    const adapter = new ClaudeProviderAdapter(jest.fn());
    expect(adapter.provider).toBe("claude");
  });
});
