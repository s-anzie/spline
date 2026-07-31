import { AgentSessionStatus, ApprovalState } from "@repo/db";

import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import {
  AgentSessionApprovalStateChanged,
  AgentSessionStarted,
  AgentSessionStatusChanged,
} from "./agent-session-events";
import { InvalidAgentSessionStatusTransitionError } from "./agent-session.errors";

const TERMINAL_STATUSES: AgentSessionStatus[] = [
  AgentSessionStatus.COMPLETED,
  AgentSessionStatus.FAILED,
  AgentSessionStatus.CRASHED,
  AgentSessionStatus.STOPPED,
];

const ALLOWED_TRANSITIONS: Record<AgentSessionStatus, AgentSessionStatus[]> = {
  [AgentSessionStatus.STARTING]: [
    AgentSessionStatus.RUNNING,
    AgentSessionStatus.FAILED,
    AgentSessionStatus.CRASHED,
  ],
  [AgentSessionStatus.RUNNING]: [
    AgentSessionStatus.AWAITING_APPROVAL,
    AgentSessionStatus.COMPLETED,
    AgentSessionStatus.FAILED,
    AgentSessionStatus.CRASHED,
    AgentSessionStatus.STOPPED,
  ],
  [AgentSessionStatus.AWAITING_APPROVAL]: [
    AgentSessionStatus.RUNNING,
    AgentSessionStatus.STOPPED,
    AgentSessionStatus.CRASHED,
  ],
  [AgentSessionStatus.COMPLETED]: [],
  [AgentSessionStatus.FAILED]: [],
  [AgentSessionStatus.CRASHED]: [],
  [AgentSessionStatus.STOPPED]: [],
};

export interface AgentSessionProps {
  agentId: string;
  provider: string;
  workspaceId: string;
  machineId: string;
  status: AgentSessionStatus;
  startedAt: Date;
  lastHeartbeatAt?: Date;
  currentProcessId?: string;
  currentTaskId?: string;
  approvalState: ApprovalState;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface StartAgentSessionProps {
  agentId: string;
  provider: string;
  workspaceId: string;
  machineId: string;
  currentTaskId?: string;
}

export class AgentSession extends AggregateRoot<AgentSessionProps> {
  static start(props: StartAgentSessionProps, at: Date = new Date(), id?: UniqueEntityId): AgentSession {
    const session = new AgentSession(
      {
        agentId: props.agentId,
        provider: props.provider,
        workspaceId: props.workspaceId,
        machineId: props.machineId,
        status: AgentSessionStatus.STARTING,
        startedAt: at,
        currentTaskId: props.currentTaskId,
        approvalState: ApprovalState.NOT_REQUIRED,
        createdAt: at,
        updatedAt: at,
      },
      id,
    );
    session.record(
      new AgentSessionStarted(
        session.props.workspaceId,
        session.id.toString(),
        session.props.agentId,
        session.props.machineId,
      ),
    );
    return session;
  }

  static reconstitute(props: AgentSessionProps, id: UniqueEntityId): AgentSession {
    return new AgentSession(props, id);
  }

  get agentId(): string {
    return this.props.agentId;
  }

  get provider(): string {
    return this.props.provider;
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get machineId(): string {
    return this.props.machineId;
  }

  get status(): AgentSessionStatus {
    return this.props.status;
  }

  get startedAt(): Date {
    return this.props.startedAt;
  }

  get lastHeartbeatAt(): Date | undefined {
    return this.props.lastHeartbeatAt;
  }

  get currentProcessId(): string | undefined {
    return this.props.currentProcessId;
  }

  get currentTaskId(): string | undefined {
    return this.props.currentTaskId;
  }

  get approvalState(): ApprovalState {
    return this.props.approvalState;
  }

  get endedAt(): Date | undefined {
    return this.props.endedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get isTerminal(): boolean {
    return TERMINAL_STATUSES.includes(this.props.status);
  }

  changeStatus(next: AgentSessionStatus, at: Date = new Date()): void {
    const current = this.props.status;
    if (!ALLOWED_TRANSITIONS[current].includes(next)) {
      throw new InvalidAgentSessionStatusTransitionError(current, next);
    }
    this.props.status = next;
    this.props.updatedAt = at;
    if (TERMINAL_STATUSES.includes(next)) {
      this.props.endedAt = at;
    }
    this.record(new AgentSessionStatusChanged(this.props.workspaceId, this.id.toString(), current, next));
  }

  setApprovalState(next: ApprovalState, at: Date = new Date()): void {
    const current = this.props.approvalState;
    if (current === next) {
      return;
    }
    this.props.approvalState = next;
    this.props.updatedAt = at;
    this.record(
      new AgentSessionApprovalStateChanged(this.props.workspaceId, this.id.toString(), current, next),
    );
  }

  assignProcess(processId: string, at: Date = new Date()): void {
    this.props.currentProcessId = processId;
    this.props.updatedAt = at;
  }

  clearProcess(at: Date = new Date()): void {
    if (this.props.currentProcessId === undefined) {
      return;
    }
    this.props.currentProcessId = undefined;
    this.props.updatedAt = at;
  }

  assignTask(taskId: string, at: Date = new Date()): void {
    this.props.currentTaskId = taskId;
    this.props.updatedAt = at;
  }

  clearTask(at: Date = new Date()): void {
    if (this.props.currentTaskId === undefined) {
      return;
    }
    this.props.currentTaskId = undefined;
    this.props.updatedAt = at;
  }

  recordHeartbeat(at: Date = new Date()): void {
    this.props.lastHeartbeatAt = at;
    this.props.updatedAt = at;
  }

  isStale(now: Date, ttlMs: number): boolean {
    if (this.isTerminal) {
      return false;
    }
    const lastSignal = this.props.lastHeartbeatAt ?? this.props.startedAt;
    return now.getTime() - lastSignal.getTime() > ttlMs;
  }
}
