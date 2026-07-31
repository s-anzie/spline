import { LocalMachineRuntimeStatus } from "@repo/db";

import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { MachineLinkedToWorkspace, MachineRuntimeStatusChanged } from "./local-machine-events";
import {
  EmptyMachineHostnameError,
  InvalidMachineRuntimeStatusTransitionError,
} from "./local-machine.errors";

const ALLOWED_TRANSITIONS: Record<LocalMachineRuntimeStatus, LocalMachineRuntimeStatus[]> = {
  [LocalMachineRuntimeStatus.OFFLINE]: [LocalMachineRuntimeStatus.ONLINE],
  [LocalMachineRuntimeStatus.ONLINE]: [
    LocalMachineRuntimeStatus.OFFLINE,
    LocalMachineRuntimeStatus.DEGRADED,
  ],
  [LocalMachineRuntimeStatus.DEGRADED]: [
    LocalMachineRuntimeStatus.ONLINE,
    LocalMachineRuntimeStatus.OFFLINE,
  ],
};

export interface LocalMachineProps {
  hostname: string;
  os: string;
  workspaceIds: string[];
  runtimeStatus: LocalMachineRuntimeStatus;
  lastSeenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterMachineProps {
  hostname: string;
  os: string;
}

function normalizeHostname(hostname: string): string {
  const trimmed = hostname.trim();
  if (!trimmed) {
    throw new EmptyMachineHostnameError();
  }
  return trimmed;
}

/**
 * Not workspace-scoped by identity — one physical machine can serve several
 * workspaces (LocalMachineRuntimeStatus/workspaceIds are its own props), so
 * unlike every other aggregate in this codebase it emits its own workspace-
 * scoped DomainEvents itself (looping its own workspaceIds) rather than
 * being fixed to one workspace at construction.
 */
export class LocalMachine extends AggregateRoot<LocalMachineProps> {
  static register(props: RegisterMachineProps, id?: UniqueEntityId): LocalMachine {
    const now = new Date();
    // No linked workspace yet at registration — nothing to notify via realtime.
    return new LocalMachine(
      {
        hostname: normalizeHostname(props.hostname),
        os: props.os,
        workspaceIds: [],
        runtimeStatus: LocalMachineRuntimeStatus.OFFLINE,
        createdAt: now,
        updatedAt: now,
      },
      id,
    );
  }

  static reconstitute(props: LocalMachineProps, id: UniqueEntityId): LocalMachine {
    return new LocalMachine(props, id);
  }

  get hostname(): string {
    return this.props.hostname;
  }

  get os(): string {
    return this.props.os;
  }

  get workspaceIds(): readonly string[] {
    return this.props.workspaceIds;
  }

  get runtimeStatus(): LocalMachineRuntimeStatus {
    return this.props.runtimeStatus;
  }

  get lastSeenAt(): Date | undefined {
    return this.props.lastSeenAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  linkToWorkspace(workspaceId: string, at: Date = new Date()): void {
    if (this.props.workspaceIds.includes(workspaceId)) {
      return;
    }
    this.props.workspaceIds = [...this.props.workspaceIds, workspaceId];
    this.props.updatedAt = at;
    this.record(new MachineLinkedToWorkspace(workspaceId, this.id.toString()));
  }

  changeRuntimeStatus(next: LocalMachineRuntimeStatus, at: Date = new Date()): void {
    const current = this.props.runtimeStatus;
    if (!ALLOWED_TRANSITIONS[current].includes(next)) {
      throw new InvalidMachineRuntimeStatusTransitionError(current, next);
    }
    this.props.runtimeStatus = next;
    this.props.updatedAt = at;
    if (next === LocalMachineRuntimeStatus.ONLINE) {
      this.props.lastSeenAt = at;
    }
    for (const workspaceId of this.props.workspaceIds) {
      this.record(new MachineRuntimeStatusChanged(workspaceId, this.id.toString(), current, next));
    }
  }

  recordHeartbeat(at: Date = new Date()): void {
    this.props.lastSeenAt = at;
    this.props.updatedAt = at;
  }

  isStale(now: Date, ttlMs: number): boolean {
    if (this.props.runtimeStatus === LocalMachineRuntimeStatus.OFFLINE) {
      return false;
    }
    const lastSignal = this.props.lastSeenAt ?? this.props.createdAt;
    return now.getTime() - lastSignal.getTime() > ttlMs;
  }
}
