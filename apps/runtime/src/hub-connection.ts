import { io as defaultIoFactory, type Socket } from "socket.io-client";

export interface CommandMessage {
  id: string;
  type: string;
  workspaceId: string;
  payload: unknown;
}

export type IoFactory = (url: string, opts: Record<string, unknown>) => Socket;

const RECONNECTION_DELAY_MS = 1000;
const RECONNECTION_DELAY_MAX_MS = 15000;

/**
 * Outbound-only connection to the hub's MachineGateway (/machines namespace).
 * Contract must match apps/api/src/modules/runtime/interface/machine.gateway.ts exactly:
 * event names, payload shapes, and the machine_ token handshake auth.
 */
export class HubConnection {
  private socket: Socket | null = null;
  private commandHandler: ((command: CommandMessage) => void) | null = null;

  constructor(
    private readonly hubUrl: string,
    private readonly machineToken: string,
    private readonly ioFactory: IoFactory = defaultIoFactory,
  ) {}

  connect(): void {
    const socket = this.ioFactory(`${this.hubUrl}/machines`, {
      auth: { token: this.machineToken },
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: RECONNECTION_DELAY_MS,
      reconnectionDelayMax: RECONNECTION_DELAY_MAX_MS,
    });

    socket.on("command", (command: CommandMessage) => {
      this.commandHandler?.(command);
    });

    this.socket = socket;
    socket.connect();
  }

  disconnect(): void {
    this.requireSocket().disconnect();
  }

  onCommand(handler: (command: CommandMessage) => void): void {
    this.commandHandler = handler;
  }

  sendMachineHeartbeat(): void {
    this.requireSocket().emit("machine_heartbeat");
  }

  reportProcessStarted(processId: string, pid: number): void {
    this.requireSocket().emit("process_started", { processId, pid });
  }

  reportProcessExited(processId: string, exitCode: number): void {
    this.requireSocket().emit("process_exited", { processId, exitCode });
  }

  reportSessionStatus(sessionId: string, status: string): void {
    this.requireSocket().emit("session_status", { sessionId, status });
  }

  sendSessionHeartbeat(sessionId: string): void {
    this.requireSocket().emit("session_heartbeat", { sessionId });
  }

  private requireSocket(): Socket {
    if (!this.socket) {
      throw new Error("HubConnection is not connected — call connect() first");
    }
    return this.socket;
  }
}
