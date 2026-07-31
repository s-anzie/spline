import { ActorType, GoalStatus, Priority, ValidationState } from "@repo/db";

import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { GoalBlocked, GoalCreated, GoalProgressChanged, GoalStatusChanged } from "./goal-events";
import {
  EmptyBlockerReasonError,
  EmptyGoalTitleError,
  GoalValidationNotPendingError,
  InvalidGoalStatusTransitionError,
  SelfGoalDependencyError,
} from "./goal.errors";

export interface GoalBlocker {
  reason: string;
  reportedByType: ActorType;
  reportedById: string;
  reportedAt: string;
  resolvedAt?: string;
}

const ALLOWED_TRANSITIONS: Record<GoalStatus, GoalStatus[]> = {
  [GoalStatus.PLANNED]: [GoalStatus.ACTIVE, GoalStatus.CANCELLED],
  [GoalStatus.ACTIVE]: [
    GoalStatus.BLOCKED,
    GoalStatus.AT_RISK,
    GoalStatus.REVIEW,
    GoalStatus.CANCELLED,
  ],
  [GoalStatus.BLOCKED]: [GoalStatus.ACTIVE, GoalStatus.CANCELLED],
  [GoalStatus.AT_RISK]: [GoalStatus.ACTIVE, GoalStatus.BLOCKED, GoalStatus.CANCELLED],
  [GoalStatus.REVIEW]: [GoalStatus.ACTIVE, GoalStatus.CANCELLED],
  [GoalStatus.COMPLETED]: [],
  [GoalStatus.CANCELLED]: [],
};

export interface GoalProps {
  workspaceId: string;
  title: string;
  description?: string;
  status: GoalStatus;
  priority: Priority;
  ownerType: ActorType;
  ownerId: string;
  successCriteria: unknown[];
  progressPercentage: number;
  startDate?: Date;
  dueDate?: Date;
  dependencies: string[];
  blockers: GoalBlocker[];
  validationState: ValidationState;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGoalProps {
  workspaceId: string;
  title: string;
  description?: string;
  priority?: Priority;
  ownerType: ActorType;
  ownerId: string;
  successCriteria?: unknown[];
  startDate?: Date;
  dueDate?: Date;
}

export interface UpdateGoalDetailsProps {
  title?: string;
  description?: string;
  priority?: Priority;
  successCriteria?: unknown[];
  startDate?: Date;
  dueDate?: Date;
  dependencies?: string[];
}

function normalizeTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new EmptyGoalTitleError();
  }
  return trimmed;
}

export class Goal extends AggregateRoot<GoalProps> {
  static create(props: CreateGoalProps, id?: UniqueEntityId): Goal {
    const now = new Date();
    const goal = new Goal(
      {
        workspaceId: props.workspaceId,
        title: normalizeTitle(props.title),
        description: props.description,
        status: GoalStatus.PLANNED,
        priority: props.priority ?? Priority.MEDIUM,
        ownerType: props.ownerType,
        ownerId: props.ownerId,
        successCriteria: props.successCriteria ?? [],
        progressPercentage: 0,
        startDate: props.startDate,
        dueDate: props.dueDate,
        dependencies: [],
        blockers: [],
        validationState: ValidationState.NOT_REQUIRED,
        createdAt: now,
        updatedAt: now,
      },
      id,
    );
    goal.record(new GoalCreated(goal.props.workspaceId, goal.id.toString()));
    return goal;
  }

  static reconstitute(props: GoalProps, id: UniqueEntityId): Goal {
    return new Goal(props, id);
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get title(): string {
    return this.props.title;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get status(): GoalStatus {
    return this.props.status;
  }

  get priority(): Priority {
    return this.props.priority;
  }

  get ownerType(): ActorType {
    return this.props.ownerType;
  }

  get ownerId(): string {
    return this.props.ownerId;
  }

  get successCriteria(): readonly unknown[] {
    return this.props.successCriteria;
  }

  get progressPercentage(): number {
    return this.props.progressPercentage;
  }

  get startDate(): Date | undefined {
    return this.props.startDate;
  }

  get dueDate(): Date | undefined {
    return this.props.dueDate;
  }

  get dependencies(): readonly string[] {
    return this.props.dependencies;
  }

  get blockers(): readonly GoalBlocker[] {
    return this.props.blockers;
  }

  get validationState(): ValidationState {
    return this.props.validationState;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  updateDetails(props: UpdateGoalDetailsProps): void {
    if (props.title !== undefined) {
      this.props.title = normalizeTitle(props.title);
    }
    if (props.description !== undefined) {
      this.props.description = props.description;
    }
    if (props.priority !== undefined) {
      this.props.priority = props.priority;
    }
    if (props.successCriteria !== undefined) {
      this.props.successCriteria = props.successCriteria;
    }
    if (props.startDate !== undefined) {
      this.props.startDate = props.startDate;
    }
    if (props.dueDate !== undefined) {
      this.props.dueDate = props.dueDate;
    }
    if (props.dependencies !== undefined) {
      if (props.dependencies.includes(this.id.toString())) {
        throw new SelfGoalDependencyError(this.id.toString());
      }
      this.props.dependencies = props.dependencies;
    }
    this.props.updatedAt = new Date();
  }

  changeStatus(next: GoalStatus): void {
    const current = this.props.status;
    if (!ALLOWED_TRANSITIONS[current].includes(next)) {
      throw new InvalidGoalStatusTransitionError(current, next);
    }

    if (current === GoalStatus.BLOCKED && next !== GoalStatus.BLOCKED) {
      const now = new Date().toISOString();
      this.props.blockers = this.props.blockers.map((blocker) =>
        blocker.resolvedAt ? blocker : { ...blocker, resolvedAt: now },
      );
    }

    this.props.status = next;
    if (next === GoalStatus.REVIEW) {
      this.props.validationState = ValidationState.PENDING;
    }
    this.props.updatedAt = new Date();
    this.record(new GoalStatusChanged(this.props.workspaceId, this.id.toString(), current, next));
  }

  reportBlocker(reason: string, reporterType: ActorType, reporterId: string): void {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new EmptyBlockerReasonError();
    }

    const now = new Date();
    this.props.blockers = [
      ...this.props.blockers,
      {
        reason: trimmedReason,
        reportedByType: reporterType,
        reportedById: reporterId,
        reportedAt: now.toISOString(),
      },
    ];

    if (this.props.status !== GoalStatus.BLOCKED) {
      this.changeStatus(GoalStatus.BLOCKED);
    } else {
      this.props.updatedAt = now;
    }

    this.record(new GoalBlocked(this.props.workspaceId, this.id.toString(), trimmedReason));
  }

  recalculateProgress(completedTaskCount: number, totalTaskCount: number): void {
    const percentage =
      totalTaskCount > 0 ? Math.round((completedTaskCount / totalTaskCount) * 100) : 0;
    this.props.progressPercentage = percentage;
    this.props.updatedAt = new Date();
    this.record(new GoalProgressChanged(this.props.workspaceId, this.id.toString(), percentage));

    if (percentage === 100 && totalTaskCount > 0 && this.props.status === GoalStatus.ACTIVE) {
      this.changeStatus(GoalStatus.REVIEW);
    }
  }

  validate(): void {
    if (this.props.status !== GoalStatus.REVIEW) {
      throw new GoalValidationNotPendingError(this.id.toString());
    }
    this.props.validationState = ValidationState.VALIDATED;
    const from = this.props.status;
    this.props.status = GoalStatus.COMPLETED;
    this.props.updatedAt = new Date();
    this.record(
      new GoalStatusChanged(this.props.workspaceId, this.id.toString(), from, GoalStatus.COMPLETED),
    );
  }

  reject(): void {
    if (this.props.status !== GoalStatus.REVIEW) {
      throw new GoalValidationNotPendingError(this.id.toString());
    }
    this.props.validationState = ValidationState.REJECTED;
    const from = this.props.status;
    this.props.status = GoalStatus.ACTIVE;
    this.props.updatedAt = new Date();
    this.record(
      new GoalStatusChanged(this.props.workspaceId, this.id.toString(), from, GoalStatus.ACTIVE),
    );
  }
}
