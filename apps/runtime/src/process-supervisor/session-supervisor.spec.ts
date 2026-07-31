import type { ProviderAdapter, StartSessionInput } from "../provider-adapters/provider-adapter";
import { SessionSupervisor } from "./session-supervisor";

function createFakeAdapter(provider: string) {
  const handles = new Map<string, { onExit: (code: number | null, signal: NodeJS.Signals | null) => void }>();
  const kill = jest.fn();
  let nextPid = 2000;

  const adapter: ProviderAdapter = {
    provider,
    start: jest.fn((input: StartSessionInput) => {
      const pid = nextPid++;
      handles.set(input.prompt, { onExit: input.onExit });
      return { pid, kill };
    }),
  };

  return Object.assign(adapter, {
    kill,
    triggerExit(prompt: string, code: number | null, signal: NodeJS.Signals | null = null) {
      handles.get(prompt)?.onExit(code, signal);
    },
  });
}

describe("SessionSupervisor", () => {
  it("dispatches to the adapter matching the session's provider and reports RUNNING", () => {
    const claude = createFakeAdapter("claude");
    const codex = createFakeAdapter("codex");
    const onSessionStatus = jest.fn();
    const supervisor = new SessionSupervisor({
      adapters: new Map([
        ["claude", claude],
        ["codex", codex],
      ]),
      onSessionStatus,
    });

    supervisor.start("sess-1", "claude", "do the thing", "/tmp");

    expect(claude.start).toHaveBeenCalledWith(expect.objectContaining({ prompt: "do the thing", cwd: "/tmp" }));
    expect(codex.start).not.toHaveBeenCalled();
    expect(onSessionStatus).toHaveBeenCalledWith("sess-1", "RUNNING");
    expect(supervisor.isRunning("sess-1")).toBe(true);
  });

  it("throws when the requested provider has no registered adapter", () => {
    const supervisor = new SessionSupervisor({ adapters: new Map(), onSessionStatus: jest.fn() });
    expect(() => supervisor.start("sess-1", "unknown-provider", "hi", "/tmp")).toThrow(/unknown provider/i);
  });

  it("reports COMPLETED when the session process exits with code 0 and no stop was requested", () => {
    const claude = createFakeAdapter("claude");
    const onSessionStatus = jest.fn();
    const supervisor = new SessionSupervisor({ adapters: new Map([["claude", claude]]), onSessionStatus });

    supervisor.start("sess-1", "claude", "do the thing", "/tmp");
    claude.triggerExit("do the thing", 0);

    expect(onSessionStatus).toHaveBeenCalledWith("sess-1", "COMPLETED");
    expect(supervisor.isRunning("sess-1")).toBe(false);
  });

  it("reports FAILED when the session process exits with a non-zero code and no stop was requested", () => {
    const claude = createFakeAdapter("claude");
    const onSessionStatus = jest.fn();
    const supervisor = new SessionSupervisor({ adapters: new Map([["claude", claude]]), onSessionStatus });

    supervisor.start("sess-1", "claude", "do the thing", "/tmp");
    claude.triggerExit("do the thing", 1);

    expect(onSessionStatus).toHaveBeenCalledWith("sess-1", "FAILED");
  });

  it("reports CRASHED when the session process is killed by a signal with no exit code and no stop was requested", () => {
    const claude = createFakeAdapter("claude");
    const onSessionStatus = jest.fn();
    const supervisor = new SessionSupervisor({ adapters: new Map([["claude", claude]]), onSessionStatus });

    supervisor.start("sess-1", "claude", "do the thing", "/tmp");
    claude.triggerExit("do the thing", null, "SIGKILL");

    expect(onSessionStatus).toHaveBeenCalledWith("sess-1", "CRASHED");
  });

  it("reports STOPPED (not FAILED/CRASHED) when the exit follows an explicit stop() call", () => {
    const claude = createFakeAdapter("claude");
    const onSessionStatus = jest.fn();
    const supervisor = new SessionSupervisor({ adapters: new Map([["claude", claude]]), onSessionStatus });

    supervisor.start("sess-1", "claude", "do the thing", "/tmp");
    supervisor.stop("sess-1");
    claude.triggerExit("do the thing", null, "SIGTERM");

    expect(claude.kill).toHaveBeenCalledWith("SIGTERM");
    expect(onSessionStatus).toHaveBeenCalledWith("sess-1", "STOPPED");
  });

  it("is a no-op when stopping an unknown or already-exited session", () => {
    const claude = createFakeAdapter("claude");
    const supervisor = new SessionSupervisor({ adapters: new Map([["claude", claude]]), onSessionStatus: jest.fn() });

    expect(() => supervisor.stop("unknown-sess")).not.toThrow();
    expect(claude.kill).not.toHaveBeenCalled();
  });

  it("forwards caller-provided env to the adapter", () => {
    const claude = createFakeAdapter("claude");
    const supervisor = new SessionSupervisor({ adapters: new Map([["claude", claude]]), onSessionStatus: jest.fn() });

    supervisor.start("sess-1", "claude", "hi", "/tmp", { FOO: "bar" });

    expect(claude.start).toHaveBeenCalledWith(expect.objectContaining({ env: { FOO: "bar" } }));
  });
});
