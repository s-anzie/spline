import { CommandDispatcher } from "./command-dispatcher";

function createFakeProcessSupervisor() {
  return { start: jest.fn(), stop: jest.fn() };
}

function createFakeSessionSupervisor() {
  return { start: jest.fn(), stop: jest.fn() };
}

describe("CommandDispatcher", () => {
  it("routes a START_PROCESS command to the process supervisor", () => {
    const processSupervisor = createFakeProcessSupervisor();
    const sessionSupervisor = createFakeSessionSupervisor();
    const dispatcher = new CommandDispatcher({ processSupervisor, sessionSupervisor });

    dispatcher.dispatch({
      id: "cmd-1",
      type: "START_PROCESS",
      workspaceId: "ws-1",
      payload: { processId: "proc-1", command: "npm run dev", cwd: "/home/bradley/spline/apps/web", env: { PORT: "3000" } },
    });

    expect(processSupervisor.start).toHaveBeenCalledWith(
      "proc-1",
      "npm run dev",
      "/home/bradley/spline/apps/web",
      { PORT: "3000" },
    );
  });

  it("routes a STOP_PROCESS command to the process supervisor", () => {
    const processSupervisor = createFakeProcessSupervisor();
    const sessionSupervisor = createFakeSessionSupervisor();
    const dispatcher = new CommandDispatcher({ processSupervisor, sessionSupervisor });

    dispatcher.dispatch({
      id: "cmd-1",
      type: "STOP_PROCESS",
      workspaceId: "ws-1",
      payload: { processId: "proc-1", pid: 4242 },
    });

    expect(processSupervisor.stop).toHaveBeenCalledWith("proc-1");
  });

  it("routes a START_SESSION command to the session supervisor", () => {
    const processSupervisor = createFakeProcessSupervisor();
    const sessionSupervisor = createFakeSessionSupervisor();
    const dispatcher = new CommandDispatcher({ processSupervisor, sessionSupervisor });

    dispatcher.dispatch({
      id: "cmd-1",
      type: "START_SESSION",
      workspaceId: "ws-1",
      payload: {
        sessionId: "sess-1",
        agentId: "agent-1",
        provider: "claude",
        prompt: "do the thing",
        taskId: "task-1",
        cwd: "/home/bradley/spline",
      },
    });

    expect(sessionSupervisor.start).toHaveBeenCalledWith(
      "sess-1",
      "claude",
      "do the thing",
      "/home/bradley/spline",
      undefined,
      undefined,
      undefined,
    );
  });

  it("injects the locally resolved agent credentials and protects them from command overrides", () => {
    const processSupervisor = createFakeProcessSupervisor();
    const sessionSupervisor = createFakeSessionSupervisor();
    const resolveAgentEnvironment = jest.fn(() => ({
      SPLINE_AGENT_TOKEN: "agent_safe.token",
      SPLINE_WORKSPACE_ID: "ws-1",
    }));
    const dispatcher = new CommandDispatcher({
      processSupervisor,
      sessionSupervisor,
      resolveAgentEnvironment,
    });

    dispatcher.dispatch({
      id: "cmd-credentials",
      type: "START_SESSION",
      workspaceId: "ws-1",
      payload: {
        sessionId: "sess-1",
        agentId: "agent-1",
        provider: "codex",
        prompt: "work",
        cwd: "/workspace",
        env: { SPLINE_AGENT_TOKEN: "untrusted", EXTRA: "value" },
      },
    });

    expect(resolveAgentEnvironment).toHaveBeenCalledWith("agent-1", "ws-1");
    expect(sessionSupervisor.start).toHaveBeenCalledWith(
      "sess-1",
      "codex",
      "work",
      "/workspace",
      {
        EXTRA: "value",
        SPLINE_AGENT_TOKEN: "agent_safe.token",
        SPLINE_WORKSPACE_ID: "ws-1",
      },
      undefined,
      undefined,
    );
  });

  it("routes a STOP_SESSION command to the session supervisor", () => {
    const processSupervisor = createFakeProcessSupervisor();
    const sessionSupervisor = createFakeSessionSupervisor();
    const dispatcher = new CommandDispatcher({ processSupervisor, sessionSupervisor });

    dispatcher.dispatch({
      id: "cmd-1",
      type: "STOP_SESSION",
      workspaceId: "ws-1",
      payload: { sessionId: "sess-1", agentId: "agent-1" },
    });

    expect(sessionSupervisor.stop).toHaveBeenCalledWith("sess-1");
  });

  it("swallows errors from a handler so one bad command cannot take down the connection loop", () => {
    const processSupervisor = createFakeProcessSupervisor();
    processSupervisor.start.mockImplementation(() => {
      throw new Error("boom");
    });
    const sessionSupervisor = createFakeSessionSupervisor();
    const onError = jest.fn();
    const dispatcher = new CommandDispatcher({ processSupervisor, sessionSupervisor, onError });

    expect(() =>
      dispatcher.dispatch({
        id: "cmd-1",
        type: "START_PROCESS",
        workspaceId: "ws-1",
        payload: { processId: "proc-1", command: "npm run dev", cwd: "/tmp" },
      }),
    ).not.toThrow();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ id: "cmd-1" }));
  });

  it("reports an error for an unknown command type instead of throwing", () => {
    const processSupervisor = createFakeProcessSupervisor();
    const sessionSupervisor = createFakeSessionSupervisor();
    const onError = jest.fn();
    const dispatcher = new CommandDispatcher({ processSupervisor, sessionSupervisor, onError });

    dispatcher.dispatch({ id: "cmd-1", type: "SOMETHING_UNKNOWN", workspaceId: "ws-1", payload: {} });

    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ id: "cmd-1" }));
  });
});
