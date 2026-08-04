import { HubConnection } from "./hub-connection";

function createFakeSocket() {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    handlers,
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
}

describe("HubConnection", () => {
  it("connects to the /machines namespace with the machine token in the handshake auth", () => {
    const socket = createFakeSocket();
    const ioFactory = jest.fn().mockReturnValue(socket);
    const hub = new HubConnection("http://localhost:3001", "machine_abc.secret", ioFactory);

    hub.connect();

    expect(ioFactory).toHaveBeenCalledWith(
      "http://localhost:3001/machines",
      expect.objectContaining({ auth: { token: "machine_abc.secret" }, autoConnect: false }),
    );
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it("configures socket.io-client's built-in reconnection with backoff", () => {
    const socket = createFakeSocket();
    const ioFactory = jest.fn().mockReturnValue(socket);
    const hub = new HubConnection("http://localhost:3001", "machine_abc.secret", ioFactory);

    hub.connect();

    const opts = ioFactory.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(opts["reconnection"]).toBe(true);
    expect(opts["reconnectionDelay"]).toBeGreaterThan(0);
    expect(opts["reconnectionDelayMax"]).toBeGreaterThanOrEqual(opts["reconnectionDelay"] as number);
  });

  it("invokes the registered command handler when the hub pushes a command event", () => {
    const socket = createFakeSocket();
    const ioFactory = jest.fn().mockReturnValue(socket);
    const hub = new HubConnection("http://localhost:3001", "machine_abc.secret", ioFactory);
    const onCommand = jest.fn();
    hub.onCommand(onCommand);

    hub.connect();
    const command = { id: "cmd-1", type: "START_PROCESS", workspaceId: "ws-1", payload: { processId: "p1" } };
    socket.handlers.get("command")?.(command);

    expect(onCommand).toHaveBeenCalledWith(command);
  });

  it("notifies the runtime when supervision by the hub is lost", () => {
    const socket = createFakeSocket();
    const hub = new HubConnection(
      "http://localhost:3001",
      "machine_abc.secret",
      jest.fn().mockReturnValue(socket),
    );
    const onDisconnect = jest.fn();
    hub.onDisconnect(onDisconnect);

    hub.connect();
    socket.handlers.get("disconnect")?.("transport close");

    expect(onDisconnect).toHaveBeenCalledWith("transport close");
  });

  it("sends a machine heartbeat", () => {
    const socket = createFakeSocket();
    const hub = new HubConnection("http://localhost:3001", "machine_abc.secret", jest.fn().mockReturnValue(socket));
    hub.connect();

    hub.sendMachineHeartbeat();

    expect(socket.emit).toHaveBeenCalledWith("machine_heartbeat");
  });

  it("reports a process started", () => {
    const socket = createFakeSocket();
    const hub = new HubConnection("http://localhost:3001", "machine_abc.secret", jest.fn().mockReturnValue(socket));
    hub.connect();

    hub.reportProcessStarted("proc-1", 4242);

    expect(socket.emit).toHaveBeenCalledWith("process_started", { processId: "proc-1", pid: 4242 });
  });

  it("reports a process exited", () => {
    const socket = createFakeSocket();
    const hub = new HubConnection("http://localhost:3001", "machine_abc.secret", jest.fn().mockReturnValue(socket));
    hub.connect();

    hub.reportProcessExited("proc-1", 0);

    expect(socket.emit).toHaveBeenCalledWith("process_exited", { processId: "proc-1", exitCode: 0 });
  });

  it("reports a session status", () => {
    const socket = createFakeSocket();
    const hub = new HubConnection("http://localhost:3001", "machine_abc.secret", jest.fn().mockReturnValue(socket));
    hub.connect();

    hub.reportSessionStatus("sess-1", "RUNNING");

    expect(socket.emit).toHaveBeenCalledWith("session_status", { sessionId: "sess-1", status: "RUNNING" });
  });

  it("reports a detected provider quota window", () => {
    const socket = createFakeSocket();
    const hub = new HubConnection("http://localhost:3001", "machine_abc.secret", jest.fn().mockReturnValue(socket));
    hub.connect();

    hub.reportProviderQuota("sess-1", "claude", "2026-08-04T08:00:00.000Z", "usage limit");

    expect(socket.emit).toHaveBeenCalledWith("provider_quota", {
      sessionId: "sess-1",
      provider: "claude",
      resetAt: "2026-08-04T08:00:00.000Z",
      reason: "usage limit",
    });
  });

  it("sends a session heartbeat", () => {
    const socket = createFakeSocket();
    const hub = new HubConnection("http://localhost:3001", "machine_abc.secret", jest.fn().mockReturnValue(socket));
    hub.connect();

    hub.sendSessionHeartbeat("sess-1");

    expect(socket.emit).toHaveBeenCalledWith("session_heartbeat", { sessionId: "sess-1" });
  });

  it("disconnects the underlying socket", () => {
    const socket = createFakeSocket();
    const hub = new HubConnection("http://localhost:3001", "machine_abc.secret", jest.fn().mockReturnValue(socket));
    hub.connect();

    hub.disconnect();

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it("throws when a report method is called before connect", () => {
    const hub = new HubConnection("http://localhost:3001", "machine_abc.secret", jest.fn());
    expect(() => hub.sendMachineHeartbeat()).toThrow(/not connected/i);
  });
});
