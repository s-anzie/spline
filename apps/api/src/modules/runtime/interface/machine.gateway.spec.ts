import { RuntimeCommandType } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { RuntimeCommand } from "../domain/runtime-command";
import { MachineGateway } from "./machine.gateway";

function makeSocket(auth: Record<string, unknown>) {
  return {
    handshake: { auth },
    data: {} as Record<string, unknown>,
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

function makeCollaborators() {
  return {
    verifyMachineToken: { execute: jest.fn() },
    updateMachinePresence: { execute: jest.fn().mockResolvedValue({ isFailure: false, isSuccess: true }) },
    commands: { listPendingByMachine: jest.fn().mockResolvedValue([]), findById: jest.fn(), save: jest.fn() },
    reportProcessStarted: { execute: jest.fn() },
    reportProcessExited: { execute: jest.fn() },
    reportSessionStatus: { execute: jest.fn() },
    sendSessionHeartbeat: { execute: jest.fn() },
    appendSessionOutput: { execute: jest.fn() },
    reportProviderSessionId: { execute: jest.fn() },
    reconcileMachineSessions: { execute: jest.fn() },
    prisma: {
      agentSession: { findFirst: jest.fn() },
      providerProfile: { update: jest.fn() },
    },
    events: { emit: jest.fn() },
  };
}

function makeGateway(collaborators: ReturnType<typeof makeCollaborators>) {
  return new MachineGateway(
    collaborators.verifyMachineToken as never,
    collaborators.updateMachinePresence as never,
    collaborators.commands as never,
    collaborators.reportProcessStarted as never,
    collaborators.reportProcessExited as never,
    collaborators.reportSessionStatus as never,
    collaborators.sendSessionHeartbeat as never,
    collaborators.appendSessionOutput as never,
    collaborators.reportProviderSessionId as never,
    collaborators.reconcileMachineSessions as never,
    collaborators.prisma as never,
    collaborators.events as never,
  );
}

describe("MachineGateway", () => {
  it("accepts a quota window only from the machine owning the provider session", async () => {
    const collaborators = makeCollaborators();
    collaborators.prisma.agentSession.findFirst.mockResolvedValue({ id: "sess-1" });
    collaborators.prisma.providerProfile.update.mockResolvedValue({});
    const gateway = makeGateway(collaborators);
    const socket = makeSocket({});
    socket.data["machineId"] = "machine-1";
    const resetAt = new Date(Date.now() + 60_000).toISOString();

    await gateway.onProviderQuota(socket as never, {
      sessionId: "sess-1",
      provider: "claude",
      resetAt,
      reason: "usage limit",
    });

    expect(collaborators.prisma.agentSession.findFirst).toHaveBeenCalledWith({
      where: { id: "sess-1", machineId: "machine-1", provider: "claude" },
      select: { id: true },
    });
    expect(collaborators.prisma.providerProfile.update).toHaveBeenCalledWith({
      where: { provider: "claude" },
      data: {
        quotaUnavailableUntil: new Date(resetAt),
        quotaReason: "usage limit",
      },
    });
    expect(collaborators.events.emit).toHaveBeenCalledWith(
      "provider.availability_changed",
      expect.objectContaining({ provider: "claude", available: false, cause: "QUOTA" }),
    );
  });

  it("disconnects a socket that presents no token", async () => {
    const collaborators = makeCollaborators();
    const gateway = makeGateway(collaborators);
    const socket = makeSocket({});

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(collaborators.verifyMachineToken.execute).not.toHaveBeenCalled();
  });

  it("disconnects a socket presenting an invalid token", async () => {
    const collaborators = makeCollaborators();
    collaborators.verifyMachineToken.execute.mockResolvedValue(null);
    const gateway = makeGateway(collaborators);
    const socket = makeSocket({ token: "garbage" });

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it("marks the machine online and waits for the client-ready heartbeat before delivery", async () => {
    const collaborators = makeCollaborators();
    collaborators.verifyMachineToken.execute.mockResolvedValue({ machineId: "machine-1" });
    const command = RuntimeCommand.enqueue(
      { machineId: "machine-1", workspaceId: "w1", type: RuntimeCommandType.START_PROCESS, payload: { a: 1 } },
      new Date(),
      UniqueEntityId.create("cmd-1"),
    );
    collaborators.commands.listPendingByMachine.mockResolvedValue([command]);
    const gateway = makeGateway(collaborators);
    const socket = makeSocket({ token: "machine_cred-1.secret" });

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(collaborators.updateMachinePresence.execute).toHaveBeenCalledWith({
      machineId: "machine-1",
      connected: true,
    });
    expect(socket.emit).not.toHaveBeenCalledWith("command", expect.anything());
    expect(collaborators.commands.save).not.toHaveBeenCalled();
  });

  it("marks the machine offline on disconnect", async () => {
    const collaborators = makeCollaborators();
    const gateway = makeGateway(collaborators);
    const socket = { data: { machineId: "machine-1" } };

    await gateway.handleDisconnect(socket as never);

    expect(collaborators.updateMachinePresence.execute).toHaveBeenCalledWith({
      machineId: "machine-1",
      connected: false,
    });
    expect(collaborators.reconcileMachineSessions.execute).not.toHaveBeenCalled();
  });

  it("does nothing on disconnect for a socket that never authenticated", async () => {
    const collaborators = makeCollaborators();
    const gateway = makeGateway(collaborators);
    const socket = { data: {} };

    await gateway.handleDisconnect(socket as never);

    expect(collaborators.updateMachinePresence.execute).not.toHaveBeenCalled();
  });

  it("routes process_started reports to ReportProcessStartedUseCase", async () => {
    const collaborators = makeCollaborators();
    const gateway = makeGateway(collaborators);

    await gateway.onProcessStarted({ processId: "process-1", pid: 4242 });

    expect(collaborators.reportProcessStarted.execute).toHaveBeenCalledWith({
      processId: "process-1",
      pid: 4242,
    });
  });

  it("routes process_exited reports to ReportProcessExitedUseCase", async () => {
    const collaborators = makeCollaborators();
    const gateway = makeGateway(collaborators);

    await gateway.onProcessExited({ processId: "process-1", exitCode: 1 });

    expect(collaborators.reportProcessExited.execute).toHaveBeenCalledWith({
      processId: "process-1",
      exitCode: 1,
    });
  });

  it("routes session_heartbeat to SendSessionHeartbeatUseCase", async () => {
    const collaborators = makeCollaborators();
    const gateway = makeGateway(collaborators);

    await gateway.onSessionHeartbeat({ sessionId: "session-1" });

    expect(collaborators.sendSessionHeartbeat.execute).toHaveBeenCalledWith({ sessionId: "session-1" });
  });

  it("delivers pending commands on machine_heartbeat", async () => {
    const collaborators = makeCollaborators();
    const gateway = makeGateway(collaborators);
    const socket = makeSocket({});
    socket.data.machineId = "machine-1";

    await gateway.onMachineHeartbeat(socket as never);

    expect(collaborators.updateMachinePresence.execute).toHaveBeenCalledWith({
      machineId: "machine-1",
      connected: true,
    });
    expect(collaborators.commands.listPendingByMachine).toHaveBeenCalledWith("machine-1");
  });

  it("completes a command only when the authenticated machine reports its result", async () => {
    const collaborators = makeCollaborators();
    const command = RuntimeCommand.enqueue(
      { machineId: "machine-1", workspaceId: "w1", type: RuntimeCommandType.START_SESSION, payload: {} },
      new Date(),
      UniqueEntityId.create("cmd-1"),
    );
    command.markSent();
    collaborators.commands.findById.mockResolvedValue(command);
    const gateway = makeGateway(collaborators);
    const socket = makeSocket({});
    socket.data.machineId = "machine-1";

    await gateway.onCommandResult(socket as never, {
      commandId: "cmd-1",
      status: "COMPLETED",
    });

    expect(command.status).toBe("COMPLETED");
    expect(collaborators.commands.save).toHaveBeenCalledWith(command);
  });
});
