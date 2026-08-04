import type { ProviderAdapter, StartSessionInput } from "../provider-adapters/provider-adapter";
import { SessionSupervisor } from "./session-supervisor";

function createFakeAdapter(provider: string) {
  const handles = new Map<string, Pick<StartSessionInput, "onExit" | "onOutput">>();
  const kill = jest.fn();
  let nextPid = 2000;

  const adapter: ProviderAdapter = {
    provider,
    start: jest.fn((input: StartSessionInput) => {
      const pid = nextPid++;
      handles.set(input.prompt, { onExit: input.onExit, onOutput: input.onOutput });
      return { pid, kill };
    }),
  };

  return Object.assign(adapter, {
    kill,
    triggerExit(prompt: string, code: number | null, signal: NodeJS.Signals | null = null) {
      handles.get(prompt)?.onExit(code, signal);
    },
    triggerOutput(prompt: string, content: string, stream: "stdout" | "stderr" = "stdout") {
      handles.get(prompt)?.onOutput(content, stream);
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

  it("does not spawn a second provider process for a duplicate START_SESSION command", () => {
    const claude = createFakeAdapter("claude");
    const onSessionStatus = jest.fn();
    const supervisor = new SessionSupervisor({
      adapters: new Map([["claude", claude]]),
      onSessionStatus,
    });

    supervisor.start("sess-1", "claude", "first", "/tmp");
    supervisor.start("sess-1", "claude", "duplicate", "/tmp");

    expect(claude.start).toHaveBeenCalledTimes(1);
    expect(onSessionStatus).toHaveBeenCalledTimes(1);
  });

  it("throws when the requested provider has no registered adapter", () => {
    const supervisor = new SessionSupervisor({ adapters: new Map(), onSessionStatus: jest.fn() });
    expect(() => supervisor.start("sess-1", "unknown-provider", "hi", "/tmp")).toThrow(/unknown provider/i);
  });

  it("reports startup failures to the console and terminates the session", () => {
    const adapter: ProviderAdapter = {
      provider: "codex",
      start: jest.fn(() => {
        throw new Error("Provider executable not found on PATH: codex");
      }),
    };
    const onSessionStatus = jest.fn();
    const onSessionOutput = jest.fn();
    const supervisor = new SessionSupervisor({
      adapters: new Map([["codex", adapter]]),
      onSessionStatus,
      onSessionOutput,
    });

    expect(() =>
      supervisor.start("sess-1", "codex", "work", "/tmp"),
    ).not.toThrow();
    expect(onSessionOutput).toHaveBeenCalledWith(
      "sess-1",
      0,
      "stderr",
      expect.stringContaining("Provider executable not found"),
    );
    expect(onSessionStatus).toHaveBeenCalledWith("sess-1", "FAILED");
    expect(supervisor.isRunning("sess-1")).toBe(false);
  });

  it("reports IDLE when a provider turn exits cleanly", () => {
    const claude = createFakeAdapter("claude");
    const onSessionStatus = jest.fn();
    const supervisor = new SessionSupervisor({ adapters: new Map([["claude", claude]]), onSessionStatus });

    supervisor.start("sess-1", "claude", "do the thing", "/tmp");
    claude.triggerExit("do the thing", 0);

    expect(onSessionStatus).toHaveBeenCalledWith("sess-1", "IDLE");
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

  it("fails and terminates a provider that emits a fatal authentication error", async () => {
    const claude = createFakeAdapter("claude");
    const onSessionStatus = jest.fn();
    const supervisor = new SessionSupervisor({
      adapters: new Map([["claude", claude]]),
      onSessionStatus,
    });

    supervisor.start("sess-1", "claude", "do the thing", "/tmp");
    claude.triggerOutput(
      "do the thing",
      'Failed to authenticate. {"type":"authentication_error"}',
      "stderr",
    );
    await Promise.resolve();

    expect(onSessionStatus).toHaveBeenLastCalledWith("sess-1", "FAILED");
    expect(claude.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("reports a quota window and terminates the provider turn", async () => {
    const claude = createFakeAdapter("claude");
    const onSessionStatus = jest.fn();
    const onProviderQuota = jest.fn();
    const supervisor = new SessionSupervisor({
      adapters: new Map([["claude", claude]]),
      onSessionStatus,
      onProviderQuota,
    });
    supervisor.start("sess-1", "claude", "work", "/tmp");
    claude.triggerOutput("work", "You've hit your usage limit. Try again in 2h.", "stderr");
    await Promise.resolve();

    expect(onProviderQuota).toHaveBeenCalledWith(
      "sess-1",
      "claude",
      expect.any(String),
      expect.stringContaining("usage limit"),
    );
    expect(onSessionStatus).toHaveBeenLastCalledWith("sess-1", "FAILED");
    expect(claude.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("does not mistake the agent's own generated stdout content for a quota or authentication failure", async () => {
    // stdout is the model's real conversational/code output (stream-json),
    // not a system-level signal — an agent merely writing code that mentions
    // "429 too many requests" or "authentication_error" (e.g. implementing
    // API error handling) must never trip the provider offline.
    const claude = createFakeAdapter("claude");
    const onSessionStatus = jest.fn();
    const onProviderQuota = jest.fn();
    const supervisor = new SessionSupervisor({
      adapters: new Map([["claude", claude]]),
      onSessionStatus,
      onProviderQuota,
    });
    supervisor.start("sess-1", "claude", "work", "/tmp");
    claude.triggerOutput(
      "work",
      'Here is a retry handler: if (status === 429) { /* too many requests, rate limit exceeded */ throw new AuthenticationError("authentication_error"); }',
      "stdout",
    );
    await Promise.resolve();

    expect(onProviderQuota).not.toHaveBeenCalled();
    expect(onSessionStatus).not.toHaveBeenCalledWith("sess-1", "FAILED");
    expect(claude.kill).not.toHaveBeenCalled();
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

  it("force-kills a provider that ignores the graceful stop signal", () => {
    jest.useFakeTimers();
    const claude = createFakeAdapter("claude");
    const supervisor = new SessionSupervisor({
      adapters: new Map([["claude", claude]]),
      onSessionStatus: jest.fn(),
    });
    supervisor.start("sess-1", "claude", "work", "/tmp");

    supervisor.stop("sess-1");
    jest.advanceTimersByTime(10_000);

    expect(claude.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(claude.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
    jest.useRealTimers();
  });

  it("is a no-op when stopping an unknown or already-exited session", () => {
    const claude = createFakeAdapter("claude");
    const supervisor = new SessionSupervisor({ adapters: new Map([["claude", claude]]), onSessionStatus: jest.fn() });

    expect(() => supervisor.stop("unknown-sess")).not.toThrow();
    expect(claude.kill).not.toHaveBeenCalled();
  });

  it("stops every tracked provider session during daemon shutdown", () => {
    const claude = createFakeAdapter("claude");
    const supervisor = new SessionSupervisor({
      adapters: new Map([["claude", claude]]),
      onSessionStatus: jest.fn(),
    });
    supervisor.start("sess-1", "claude", "first", "/tmp");
    supervisor.start("sess-2", "claude", "second", "/tmp");

    expect(supervisor.stopAll()).toEqual(["sess-1", "sess-2"]);
    expect(claude.kill).toHaveBeenCalledTimes(2);
    expect(claude.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(claude.kill).toHaveBeenNthCalledWith(2, "SIGTERM");
  });

  it("forwards caller-provided env to the adapter", () => {
    const claude = createFakeAdapter("claude");
    const supervisor = new SessionSupervisor({ adapters: new Map([["claude", claude]]), onSessionStatus: jest.fn() });

    supervisor.start("sess-1", "claude", "hi", "/tmp", { FOO: "bar" });

    expect(claude.start).toHaveBeenCalledWith(expect.objectContaining({ env: { FOO: "bar" } }));
  });
});
