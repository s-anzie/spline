import type { StartCommandInput } from "./generic-command-runner";
import { ProcessSupervisor } from "./process-supervisor";

function createFakeRunner() {
  const handles = new Map<string, { onExit: (code: number | null, signal: NodeJS.Signals | null) => void }>();
  const kill = jest.fn();
  let nextPid = 1000;

  return {
    kill,
    start: jest.fn((input: StartCommandInput) => {
      const pid = nextPid++;
      handles.set(input.command, { onExit: input.onExit });
      return { pid, kill };
    }),
    triggerExit(command: string, code: number | null, signal: NodeJS.Signals | null = null) {
      handles.get(command)?.onExit(code, signal);
    },
  };
}

describe("ProcessSupervisor", () => {
  it("starts a process, reports its pid, and tracks it as running", () => {
    const runner = createFakeRunner();
    const onProcessStarted = jest.fn();
    const supervisor = new ProcessSupervisor({ runner, onProcessStarted, onProcessExited: jest.fn() });

    supervisor.start("proc-1", "npm run dev", "/tmp");

    expect(runner.start).toHaveBeenCalledWith(
      expect.objectContaining({ command: "npm run dev", cwd: "/tmp" }),
    );
    expect(onProcessStarted).toHaveBeenCalledWith("proc-1", 1000);
    expect(supervisor.isRunning("proc-1")).toBe(true);
  });

  it("reports exit and stops tracking the process once it exits", () => {
    const runner = createFakeRunner();
    const onProcessExited = jest.fn();
    const supervisor = new ProcessSupervisor({ runner, onProcessStarted: jest.fn(), onProcessExited });

    supervisor.start("proc-1", "npm run dev", "/tmp");
    runner.triggerExit("npm run dev", 0);

    expect(onProcessExited).toHaveBeenCalledWith("proc-1", 0);
    expect(supervisor.isRunning("proc-1")).toBe(false);
  });

  it("stops a tracked process by sending it a signal", () => {
    const runner = createFakeRunner();
    const supervisor = new ProcessSupervisor({ runner, onProcessStarted: jest.fn(), onProcessExited: jest.fn() });

    supervisor.start("proc-1", "npm run dev", "/tmp");
    supervisor.stop("proc-1", "SIGTERM");

    expect(runner.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("defaults to SIGTERM when no signal is given to stop", () => {
    const runner = createFakeRunner();
    const supervisor = new ProcessSupervisor({ runner, onProcessStarted: jest.fn(), onProcessExited: jest.fn() });

    supervisor.start("proc-1", "npm run dev", "/tmp");
    supervisor.stop("proc-1");

    expect(runner.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("is a no-op when stopping an unknown or already-exited process", () => {
    const runner = createFakeRunner();
    const supervisor = new ProcessSupervisor({ runner, onProcessStarted: jest.fn(), onProcessExited: jest.fn() });

    expect(() => supervisor.stop("unknown-proc")).not.toThrow();
    expect(runner.kill).not.toHaveBeenCalled();
  });

  it("reports liveness as false for a process never started", () => {
    const runner = createFakeRunner();
    const supervisor = new ProcessSupervisor({ runner, onProcessStarted: jest.fn(), onProcessExited: jest.fn() });

    expect(supervisor.isRunning("never-started")).toBe(false);
  });

  it("forwards caller-provided env down to the runner", () => {
    const runner = createFakeRunner();
    const supervisor = new ProcessSupervisor({ runner, onProcessStarted: jest.fn(), onProcessExited: jest.fn() });

    supervisor.start("proc-1", "npm run dev", "/tmp", { PORT: "3000" });

    expect(runner.start).toHaveBeenCalledWith(expect.objectContaining({ env: { PORT: "3000" } }));
  });

  it("probes real OS liveness of a tracked process by its pid via the injected probe", () => {
    const runner = createFakeRunner();
    const isAliveProbe = jest.fn().mockReturnValue(true);
    const supervisor = new ProcessSupervisor(
      { runner, onProcessStarted: jest.fn(), onProcessExited: jest.fn() },
      isAliveProbe,
    );

    supervisor.start("proc-1", "npm run dev", "/tmp");

    expect(supervisor.isAlive("proc-1")).toBe(true);
    expect(isAliveProbe).toHaveBeenCalledWith(1000);
  });

  it("returns false from isAlive for a process that isn't tracked, without probing", () => {
    const runner = createFakeRunner();
    const isAliveProbe = jest.fn();
    const supervisor = new ProcessSupervisor(
      { runner, onProcessStarted: jest.fn(), onProcessExited: jest.fn() },
      isAliveProbe,
    );

    expect(supervisor.isAlive("unknown-proc")).toBe(false);
    expect(isAliveProbe).not.toHaveBeenCalled();
  });
});
