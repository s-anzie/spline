import { AgentHealthState, AgentStatus } from "@repo/db";

import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import {
  AgentAssignedToTask,
  AgentDisabled,
  AgentEnabled,
  AgentHealthChanged,
  AgentRegistered,
  AgentStatusChanged,
  AgentUnassignedFromTask,
} from "./agent-events";
import {
  EmptyAgentDisplayNameError,
  EmptyAgentProviderError,
  InvalidAgentStatusTransitionError,
} from "./agent.errors";

const ALLOWED_STATUS_TRANSITIONS: Record<AgentStatus, AgentStatus[]> = {
  [AgentStatus.OFFLINE]: [AgentStatus.ONLINE],
  [AgentStatus.ONLINE]: [AgentStatus.OFFLINE, AgentStatus.BUSY, AgentStatus.ERROR],
  [AgentStatus.BUSY]: [AgentStatus.ONLINE, AgentStatus.OFFLINE, AgentStatus.ERROR],
  [AgentStatus.ERROR]: [AgentStatus.ONLINE, AgentStatus.OFFLINE],
};

export interface AgentProps {
  workspaceId: string;
  provider: string;
  displayName: string;
  capabilities: string[];
  status: AgentStatus;
  currentTaskId?: string;
  lastSeenAt?: Date;
  promptProfile: Record<string, unknown>;
  permissions: string[];
  healthState: AgentHealthState;
  /** Decommissioned: excluded from broadcasts/assignment/session eligibility, credential revoked. Independent of `status` (live connectivity). */
  disabledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterAgentProps {
  workspaceId: string;
  provider: string;
  displayName: string;
  capabilities?: string[];
  promptProfile?: Record<string, unknown>;
  permissions?: string[];
}

export interface UpdateAgentDetailsProps {
  provider?: string;
  displayName?: string;
  capabilities?: string[];
  promptProfile?: Record<string, unknown>;
  permissions?: string[];
}

function normalizeProvider(provider: string): string {
  const trimmed = provider.trim();
  if (!trimmed) {
    throw new EmptyAgentProviderError();
  }
  return trimmed;
}

function normalizeDisplayName(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) {
    throw new EmptyAgentDisplayNameError();
  }
  return trimmed;
}

export class Agent extends AggregateRoot<AgentProps> {
  static create(props: RegisterAgentProps, id?: UniqueEntityId): Agent {
    const now = new Date();
    const agent = new Agent(
      {
        workspaceId: props.workspaceId,
        provider: normalizeProvider(props.provider),
        displayName: normalizeDisplayName(props.displayName),
        capabilities: props.capabilities ?? [],
        status: AgentStatus.OFFLINE,
        promptProfile: props.promptProfile ?? {},
        permissions: props.permissions ?? [],
        healthState: AgentHealthState.UNKNOWN,
        createdAt: now,
        updatedAt: now,
      },
      id,
    );
    agent.record(new AgentRegistered(agent.props.workspaceId, agent.id.toString()));
    return agent;
  }

  static reconstitute(props: AgentProps, id: UniqueEntityId): Agent {
    return new Agent(props, id);
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get provider(): string {
    return this.props.provider;
  }

  get displayName(): string {
    return this.props.displayName;
  }

  get capabilities(): readonly string[] {
    return this.props.capabilities;
  }

  get status(): AgentStatus {
    return this.props.status;
  }

  get currentTaskId(): string | undefined {
    return this.props.currentTaskId;
  }

  get lastSeenAt(): Date | undefined {
    return this.props.lastSeenAt;
  }

  get promptProfile(): Record<string, unknown> {
    return this.props.promptProfile;
  }

  get permissions(): readonly string[] {
    return this.props.permissions;
  }

  get healthState(): AgentHealthState {
    return this.props.healthState;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get disabledAt(): Date | undefined {
    return this.props.disabledAt;
  }

  get isDisabled(): boolean {
    return this.props.disabledAt !== undefined;
  }

  updateDetails(props: UpdateAgentDetailsProps): void {
    if (props.provider !== undefined) {
      this.props.provider = normalizeProvider(props.provider);
    }
    if (props.displayName !== undefined) {
      this.props.displayName = normalizeDisplayName(props.displayName);
    }
    if (props.capabilities !== undefined) {
      this.props.capabilities = props.capabilities;
    }
    if (props.promptProfile !== undefined) {
      this.props.promptProfile = props.promptProfile;
    }
    if (props.permissions !== undefined) {
      this.props.permissions = props.permissions;
    }
    this.props.updatedAt = new Date();
  }

  /**
   * Strict transition table (mirrors Task.changeStatus): same-status calls
   * are rejected here by design, not treated as a no-op. Presence hooks that
   * fire on every WS reconnect must check `status` before calling this, so
   * a flaky reconnect doesn't throw — see UpdateAgentPresenceUseCase.
   */
  changeStatus(next: AgentStatus, at: Date = new Date()): void {
    const current = this.props.status;
    if (!ALLOWED_STATUS_TRANSITIONS[current].includes(next)) {
      throw new InvalidAgentStatusTransitionError(current, next);
    }
    this.props.status = next;
    this.props.updatedAt = at;
    if (next === AgentStatus.ONLINE || next === AgentStatus.BUSY) {
      this.props.lastSeenAt = at;
    }
    this.record(new AgentStatusChanged(this.props.workspaceId, this.id.toString(), current, next));
  }

  /**
   * Unlike status, health has no workflow-driven transition table — it's a
   * monitoring signal that can move freely between any two values. Only
   * skipped (no event) when it doesn't actually change, since health probes
   * report the same value far more often than they report a real change.
   */
  updateHealth(next: AgentHealthState, at: Date = new Date()): void {
    const current = this.props.healthState;
    if (current === next) {
      return;
    }
    this.props.healthState = next;
    this.props.updatedAt = at;
    this.record(new AgentHealthChanged(this.props.workspaceId, this.id.toString(), current, next));
  }

  assignToTask(taskId: string, at: Date = new Date()): void {
    this.props.currentTaskId = taskId;
    this.props.updatedAt = at;
    this.record(new AgentAssignedToTask(this.props.workspaceId, this.id.toString(), taskId));
  }

  unassignFromTask(at: Date = new Date()): void {
    if (this.props.currentTaskId === undefined) {
      return;
    }
    const taskId = this.props.currentTaskId;
    this.props.currentTaskId = undefined;
    this.props.updatedAt = at;
    this.record(new AgentUnassignedFromTask(this.props.workspaceId, this.id.toString(), taskId));
  }

  recordHeartbeat(at: Date = new Date()): void {
    this.props.lastSeenAt = at;
    this.props.updatedAt = at;
  }

  /** Idempotent, unlike changeStatus — a manager retrying "decommission this agent" should never error. */
  disable(at: Date = new Date()): void {
    if (this.isDisabled) {
      return;
    }
    this.props.disabledAt = at;
    this.props.updatedAt = at;
    this.record(new AgentDisabled(this.props.workspaceId, this.id.toString()));
  }

  enable(at: Date = new Date()): void {
    if (!this.isDisabled) {
      return;
    }
    this.props.disabledAt = undefined;
    this.props.updatedAt = at;
    this.record(new AgentEnabled(this.props.workspaceId, this.id.toString()));
  }
}
