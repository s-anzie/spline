import { EventEmitter } from "node:events";

import { GenericCommandRunner } from "./generic-command-runner";

function createFakeChildProcess() {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: jest.Mock;
  };
  child.pid = 9999;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  return child;
}

describe("GenericCommandRunner", () => {
  it("tokenizes the command string via shell-quote into an argv array, never a shell string", () => {
    const child = createFakeChildProcess();
    const spawn = jest.fn().mockReturnValue(child);
    const runner = new GenericCommandRunner(spawn);

    runner.start({
      command: "npm run dev -- --port=3000",
      cwd: "/home/bradley/spline/apps/web",
      onOutput: jest.fn(),
      onExit: jest.fn(),
    });

    expect(spawn).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawn.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(command).toBe("npm");
    expect(args).toEqual(["run", "dev", "--", "--port=3000"]);
    expect(options["shell"]).not.toBe(true);
    expect(options["cwd"]).toBe("/home/bradley/spline/apps/web");
  });

  it("respects single and double quoted segments as single tokens", () => {
    const child = createFakeChildProcess();
    const spawn = jest.fn().mockReturnValue(child);
    const runner = new GenericCommandRunner(spawn);

    runner.start({
      command: `echo "hello world" 'second arg'`,
      cwd: "/tmp",
      onOutput: jest.fn(),
      onExit: jest.fn(),
    });

    const args = spawn.mock.calls[0]?.[1] as string[];
    expect(args).toEqual(["hello world", "second arg"]);
  });

  it("throws on shell operators it cannot safely honor without a real shell", () => {
    const runner = new GenericCommandRunner(jest.fn());

    expect(() =>
      runner.start({
        command: "npm run dev && rm -rf /",
        cwd: "/tmp",
        onOutput: jest.fn(),
        onExit: jest.fn(),
      }),
    ).toThrow(/unsupported/i);
  });

  it("throws on an empty command", () => {
    const runner = new GenericCommandRunner(jest.fn());
    expect(() => runner.start({ command: "   ", cwd: "/tmp", onOutput: jest.fn(), onExit: jest.fn() })).toThrow(
      /empty/i,
    );
  });

  it("never spreads the daemon's own process.env — only PATH/HOME plus caller-provided env", () => {
    const child = createFakeChildProcess();
    const spawn = jest.fn().mockReturnValue(child);
    const runner = new GenericCommandRunner(spawn);

    runner.start({
      command: "npm run dev",
      cwd: "/tmp",
      env: { PORT: "3000" },
      onOutput: jest.fn(),
      onExit: jest.fn(),
    });

    const options = spawn.mock.calls[0]?.[2] as { env: Record<string, string> };
    expect(options.env).toMatchObject({ PORT: "3000" });
    expect(Object.keys(options.env).sort()).toEqual([...new Set(["HOME", "PATH", "PORT"])].sort());
  });

  it("streams stdout/stderr and reports exit", () => {
    const child = createFakeChildProcess();
    const spawn = jest.fn().mockReturnValue(child);
    const runner = new GenericCommandRunner(spawn);
    const onOutput = jest.fn();
    const onExit = jest.fn();

    runner.start({ command: "npm run dev", cwd: "/tmp", onOutput, onExit });
    child.stdout.emit("data", Buffer.from("out"));
    child.stderr.emit("data", Buffer.from("err"));
    child.emit("exit", 0, null);

    expect(onOutput).toHaveBeenNthCalledWith(1, "out", "stdout");
    expect(onOutput).toHaveBeenNthCalledWith(2, "err", "stderr");
    expect(onExit).toHaveBeenCalledWith(0, null);
  });

  it("returns a handle with pid and kill", () => {
    const child = createFakeChildProcess();
    const spawn = jest.fn().mockReturnValue(child);
    const runner = new GenericCommandRunner(spawn);

    const handle = runner.start({ command: "npm run dev", cwd: "/tmp", onOutput: jest.fn(), onExit: jest.fn() });
    handle.kill("SIGTERM");

    expect(handle.pid).toBe(9999);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
