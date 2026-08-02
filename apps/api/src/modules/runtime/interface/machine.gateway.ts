import { AgentSessionStatus } from "@repo/db";
import { Inject } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Namespace, Socket } from "socket.io";

import { VerifyMachineTokenUseCase } from "../../identity/application/verify-machine-token.use-case";
import { AppendSessionOutputUseCase } from "../application/append-session-output.use-case";
import { ReportProcessExitedUseCase } from "../application/report-process-exited.use-case";
import { ReportProcessStartedUseCase } from "../application/report-process-started.use-case";
import { ReportSessionStatusUseCase } from "../application/report-session-status.use-case";
import { ReportProviderSessionIdUseCase } from "../application/report-provider-session-id.use-case";
import { ReconcileMachineSessionsUseCase } from "../application/reconcile-machine-sessions.use-case";
import { SendSessionHeartbeatUseCase } from "../application/send-session-heartbeat.use-case";
import { UpdateMachinePresenceUseCase } from "../application/update-machine-presence.use-case";
import {
  RUNTIME_COMMAND_REPOSITORY,
  RuntimeCommandRepository,
} from "../domain/ports/runtime-command.repository.port";
import { RuntimeCommand } from "../domain/runtime-command";

function toCommandMessage(command: RuntimeCommand) {
  return {
    id: command.id.toString(),
    type: command.type,
    workspaceId: command.workspaceId,
    payload: command.payload,
  };
}

/**
 * Separate namespace from RealtimeGateway on purpose: this is a machine
 * daemon executing commands, not a human/agent client subscribing to
 * workspace event rooms. Auth is a machine_ token verified by
 * VerifyMachineTokenUseCase — never routed through RequesterResolver/
 * ActorType, since a machine isn't an RBAC actor.
 */
@WebSocketGateway({ namespace: "/machines", cors: { origin: "*" } })
export class MachineGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly stateQueues = new WeakMap<Socket, Promise<void>>();

  @WebSocketServer()
  private server!: Namespace;
  constructor(
    private readonly verifyMachineToken: VerifyMachineTokenUseCase,
    private readonly updateMachinePresence: UpdateMachinePresenceUseCase,
    @Inject(RUNTIME_COMMAND_REPOSITORY)
    private readonly commands: RuntimeCommandRepository,
    private readonly reportProcessStarted: ReportProcessStartedUseCase,
    private readonly reportProcessExited: ReportProcessExitedUseCase,
    private readonly reportSessionStatus: ReportSessionStatusUseCase,
    private readonly sendSessionHeartbeat: SendSessionHeartbeatUseCase,
    private readonly appendSessionOutput: AppendSessionOutputUseCase,
    private readonly reportProviderSessionId: ReportProviderSessionIdUseCase,
    private readonly reconcileMachineSessions: ReconcileMachineSessionsUseCase,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    // Guard against shared-server connection hooks leaking across namespaces.
    if (client.nsp?.name && client.nsp.name !== "/machines") return;

    const token = client.handshake.auth?.["token"] as string | undefined;
    const credential = token
      ? await this.verifyMachineToken.execute(token)
      : null;

    if (!credential) {
      client.disconnect(true);
      return;
    }

    client.data.machineId = credential.machineId;
    const presenceResult = await this.updateMachinePresence.execute({
      machineId: credential.machineId,
      connected: true,
    });
    if (presenceResult.isFailure) {
      client.disconnect(true);
      return;
    }
    // Do not emit commands from the server-side connection hook. At this
    // point Socket.IO has not yet notified the daemon that the namespace is
    // connected, so an eager event can be lost while still being marked SENT.
    // The daemon emits machine_heartbeat as soon as its `connect` event fires;
    // that client-ready signal is the reliable command-delivery boundary.
  }

  async handleDisconnect(client: Socket): Promise<void> {
    if (client.nsp?.name && client.nsp.name !== "/machines") return;

    const machineId = client.data?.machineId as string | undefined;
    if (machineId) {
      await this.updateMachinePresence.execute({ machineId, connected: false });
    }
  }

  disconnectMachine(machineId: string): void {
    for (const socket of this.server.sockets.values()) {
      if (socket.data.machineId === machineId) socket.disconnect(true);
    }
  }

  private async deliverPendingCommands(
    machineId: string,
    client: Socket,
  ): Promise<void> {
    const pending = await this.commands.listPendingByMachine(machineId);
    for (const command of pending) {
      client.emit("command", toCommandMessage(command));
      command.markSent();
      await this.commands.save(command);
    }
  }

  private enqueueStateUpdate(
    client: Socket,
    operation: () => Promise<unknown>,
  ): Promise<void> {
    const previous = this.stateQueues.get(client) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(async () => {
      await operation();
    });
    this.stateQueues.set(client, current);
    return current;
  }

  /** Piggybacks pending-command delivery on every heartbeat, since commands enqueued after connect aren't pushed proactively. */
  @SubscribeMessage("machine_heartbeat")
  async onMachineHeartbeat(@ConnectedSocket() client: Socket): Promise<void> {
    const machineId = client.data?.machineId as string | undefined;
    if (!machineId) {
      return;
    }
    await this.updateMachinePresence.execute({ machineId, connected: true });
    await this.deliverPendingCommands(machineId, client);
  }

  @SubscribeMessage("process_started")
  async onProcessStarted(
    @MessageBody() body: { processId: string; pid: number },
  ): Promise<void> {
    await this.reportProcessStarted.execute(body);
  }

  @SubscribeMessage("process_exited")
  async onProcessExited(
    @MessageBody() body: { processId: string; exitCode: number },
  ): Promise<void> {
    await this.reportProcessExited.execute(body);
  }

  @SubscribeMessage("session_status")
  async onSessionStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sessionId: string; status: AgentSessionStatus },
  ): Promise<void> {
    await this.enqueueStateUpdate(client, () =>
      this.reportSessionStatus.execute(body),
    );
  }

  @SubscribeMessage("session_heartbeat")
  async onSessionHeartbeat(
    @MessageBody() body: { sessionId: string },
  ): Promise<void> {
    await this.sendSessionHeartbeat.execute(body);
  }

  @SubscribeMessage("session_output")
  async onSessionOutput(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      sessionId: string;
      sequence: number;
      stream: "stdout" | "stderr";
      content: string;
    },
  ): Promise<void> {
    const machineId = client.data?.machineId as string | undefined;
    if (!machineId) {
      client.disconnect(true);
      return;
    }
    await this.appendSessionOutput.execute({ machineId, ...body });
  }

  @SubscribeMessage("provider_session")
  async onProviderSession(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { sessionId: string; providerSessionId: string },
  ): Promise<void> {
    const machineId = client.data?.machineId as string | undefined;
    if (!machineId) {
      client.disconnect(true);
      return;
    }
    await this.enqueueStateUpdate(client, () =>
      this.reportProviderSessionId.execute({ machineId, ...body }),
    );
  }

  @SubscribeMessage("runtime_inventory")
  async onRuntimeInventory(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { runningSessionIds?: string[] },
  ): Promise<void> {
    const machineId = client.data?.machineId as string | undefined;
    if (!machineId) {
      client.disconnect(true);
      return;
    }
    await this.enqueueStateUpdate(client, () =>
      this.reconcileMachineSessions.execute(
        machineId,
        Array.isArray(body.runningSessionIds) ? body.runningSessionIds : [],
      ),
    );
  }
}
