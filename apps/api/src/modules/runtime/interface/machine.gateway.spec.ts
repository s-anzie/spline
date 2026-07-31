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
    commands: { listPendingByMachine: jest.fn().mockResolvedValue([]), save: jest.fn() },
    reportProcessStarted: { execute: jest.fn() },
    reportProcessExited: { execute: jest.fn() },
    reportSessionStatus: { execute: jest.fn() },
    sendSessionHeartbeat: { execute: jest.fn() },
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
  );
}

describe("MachineGateway", () => {
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

  it("marks the machine online and delivers pending commands on connect", async () => {
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
    expect(socket.emit).toHaveBeenCalledWith(
      "command",
      expect.objectContaining({ type: RuntimeCommandType.START_PROCESS, payload: { a: 1 } }),
    );
    expect(collaborators.commands.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "SENT" }),
    );
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
});
