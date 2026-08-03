import { RuntimeCommandStatus, RuntimeCommandType } from "@repo/db";

import { Entity } from "../../../kernel/domain/entity";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { InvalidRuntimeCommandStatusTransitionError } from "./runtime-command.errors";

const ALLOWED_TRANSITIONS: Record<RuntimeCommandStatus, RuntimeCommandStatus[]> = {
  [RuntimeCommandStatus.PENDING]: [RuntimeCommandStatus.SENT, RuntimeCommandStatus.FAILED],
  [RuntimeCommandStatus.SENT]: [
    RuntimeCommandStatus.ACKNOWLEDGED,
    RuntimeCommandStatus.COMPLETED,
    RuntimeCommandStatus.FAILED,
  ],
  [RuntimeCommandStatus.ACKNOWLEDGED]: [RuntimeCommandStatus.COMPLETED, RuntimeCommandStatus.FAILED],
  [RuntimeCommandStatus.COMPLETED]: [],
  [RuntimeCommandStatus.FAILED]: [],
};

export interface RuntimeCommandProps {
  machineId: string;
  workspaceId: string;
  type: RuntimeCommandType;
  payload: Record<string, unknown>;
  status: RuntimeCommandStatus;
  createdAt: Date;
  completedAt?: Date;
}

export interface EnqueueRuntimeCommandProps {
  machineId: string;
  workspaceId: string;
  type: RuntimeCommandType;
  payload: Record<string, unknown>;
}

/**
 * Postgres-backed command queue between the hub and a LocalMachine daemon —
 * no domain events (the meaningful realtime signal is the Process/AgentSession
 * status change the command eventually causes, not the queue mechanics).
 */
export class RuntimeCommand extends Entity<RuntimeCommandProps> {
  static enqueue(props: EnqueueRuntimeCommandProps, at: Date = new Date(), id?: UniqueEntityId): RuntimeCommand {
    return new RuntimeCommand(
      {
        machineId: props.machineId,
        workspaceId: props.workspaceId,
        type: props.type,
        payload: props.payload,
        status: RuntimeCommandStatus.PENDING,
        createdAt: at,
      },
      id,
    );
  }

  static reconstitute(props: RuntimeCommandProps, id: UniqueEntityId): RuntimeCommand {
    return new RuntimeCommand(props, id);
  }

  get machineId(): string {
    return this.props.machineId;
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get type(): RuntimeCommandType {
    return this.props.type;
  }

  get payload(): Record<string, unknown> {
    return this.props.payload;
  }

  get status(): RuntimeCommandStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }

  private changeStatus(next: RuntimeCommandStatus, at: Date): void {
    const current = this.props.status;
    if (!ALLOWED_TRANSITIONS[current].includes(next)) {
      throw new InvalidRuntimeCommandStatusTransitionError(current, next);
    }
    this.props.status = next;
    if (next === RuntimeCommandStatus.COMPLETED || next === RuntimeCommandStatus.FAILED) {
      this.props.completedAt = at;
    }
  }

  markSent(at: Date = new Date()): void {
    this.changeStatus(RuntimeCommandStatus.SENT, at);
  }

  markAcknowledged(at: Date = new Date()): void {
    this.changeStatus(RuntimeCommandStatus.ACKNOWLEDGED, at);
  }

  markCompleted(at: Date = new Date()): void {
    this.changeStatus(RuntimeCommandStatus.COMPLETED, at);
  }

  markFailed(at: Date = new Date()): void {
    this.changeStatus(RuntimeCommandStatus.FAILED, at);
  }
}
