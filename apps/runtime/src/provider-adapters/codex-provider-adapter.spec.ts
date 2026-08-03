import { EventEmitter } from "node:events";

import { CodexProviderAdapter } from "./codex-provider-adapter";

function createFakeChildProcess() {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: jest.Mock; end: jest.Mock };
    kill: jest.Mock;
  };
  child.pid = 5151;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: jest.fn(), end: jest.fn() };
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
    expect(args).toEqual([
      "exec",
      "-",
      "--json",
      "--dangerously-bypass-approvals-and-sandbox",
      "--ignore-user-config",
      "--ignore-rules",
      "--strict-config",
      "-c",
      'mcp_servers.spline.command="/run/spline-node"',
      "-c",
      'mcp_servers.spline.args=["/run/spline-toolkit/mcp-server.js"]',
      "-c",
      'mcp_servers.spline.env_vars=["SPLINE_API_URL","SPLINE_WORKSPACE_ID","SPLINE_AGENT_ID","SPLINE_AGENT_TOKEN","SPLINE_AGENT_ROLE"]',
      "-c",
      "mcp_servers.spline.required=true",
    ]);
    expect(child.stdin.write).toHaveBeenCalledWith("Do the thing");
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
    expect(options["shell"]).not.toBe(true);
    expect(options["cwd"]).toBe("/home/bradley/spline/apps/web");
  });

  it("resumes the exact native Codex thread", () => {
    const child = createFakeChildProcess();
    const spawn = jest.fn().mockReturnValue(child);
    const adapter = new CodexProviderAdapter(spawn);
    adapter.start({
      prompt: "Continue",
      cwd: "/tmp",
      resumeSessionId: "thread-1",
      onOutput: jest.fn(),
      onExit: jest.fn(),
    });
    expect(spawn.mock.calls[0]?.[1]).toEqual([
      "exec",
      "resume",
      "thread-1",
      "-",
      "--json",
      "--dangerously-bypass-approvals-and-sandbox",
      "--ignore-user-config",
      "--ignore-rules",
      "--strict-config",
      "-c",
      'mcp_servers.spline.command="/run/spline-node"',
      "-c",
      'mcp_servers.spline.args=["/run/spline-toolkit/mcp-server.js"]',
      "-c",
      'mcp_servers.spline.env_vars=["SPLINE_API_URL","SPLINE_WORKSPACE_ID","SPLINE_AGENT_ID","SPLINE_AGENT_TOKEN","SPLINE_AGENT_ROLE"]',
      "-c",
      "mcp_servers.spline.required=true",
    ]);
    expect(child.stdin.write).toHaveBeenCalledWith("Continue");
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
  });

  it("captures the native thread id from JSONL", () => {
    const child = createFakeChildProcess();
    const adapter = new CodexProviderAdapter(jest.fn().mockReturnValue(child));
    const onProviderSessionId = jest.fn();
    adapter.start({
      prompt: "Work",
      cwd: "/tmp",
      onProviderSessionId,
      onOutput: jest.fn(),
      onExit: jest.fn(),
    });
    child.stdout.emit(
      "data",
      Buffer.from('{"type":"thread.started","thread_id":"thread-42"}\n'),
    );
    expect(onProviderSessionId).toHaveBeenCalledWith("thread-42");
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
