import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { DEFAULT_PRIORITY, Priority } from "../../../kernel/domain/priority";
import { Result } from "../../../kernel/domain/result";
import { StateMachine } from "../../../kernel/domain/state-machine";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";
import {
  GoalCreated,
  GoalDependencyAdded,
  GoalDependencyRemoved,
  GoalProgressUpdated,
  GoalStatusChanged,
  GoalUpdated,
} from "./goal-events";
import {
  CompletionRequiresApprovalError,
  EmptySuccessCriteriaError,
  GoalDependencyError,
  GoalNotEditableError,
  IncompatibleGoalOwnerError,
} from "./goal.errors";

export const GOAL_STATUSES = [
  "PLANNED",
  "ACTIVE",
  "BLOCKED",
  "REVIEW",
  "COMPLETED",
  "CANCELLED",
] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/**
 * COMPLETED is only reachable from REVIEW — the structural translation of
 * "a goal is never completed without validation" (§4.5): review is the
 * submission, completion is the approval.
 */
const STATUS_MACHINE = new StateMachine<GoalStatus>({
  PLANNED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["BLOCKED", "REVIEW", "CANCELLED"],
  BLOCKED: ["ACTIVE", "CANCELLED"],
  REVIEW: ["COMPLETED", "ACTIVE", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
});

interface GoalProps {
  workspaceId: string;
  parentGoalId: string | null;
  title: string;
  description: string | null;
  successCriteria: string[];
  /** Goals that must be completed before this one may become ACTIVE (§5.6). */
  dependsOnGoalIds: string[];
  priority: Priority;
  owner: ActorRef;
  progress: number;
  status: GoalStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGoalProps {
  workspaceId: string;
  parentGoalId?: string;
  title: string;
  description?: string;
  successCriteria: readonly string[];
  priority?: Priority;
  owner: ActorRef;
  now: Date;
}

export interface UpdateGoalDetailsProps {
  title?: string;
  description?: string;
  successCriteria?: readonly string[];
  priority?: Priority;
}

export type CreateGoalError =
  | GuardViolation
  | EmptySuccessCriteriaError
  | IncompatibleGoalOwnerError;

export type UpdateGoalDetailsError =
  | GuardViolation
  | EmptySuccessCriteriaError
  | GoalNotEditableError;

function normalizeCriteria(
  criteria: readonly string[],
): Result<string[], EmptySuccessCriteriaError> {
  const cleaned = criteria.map((criterion) => criterion.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return Result.fail(new EmptySuccessCriteriaError());
  }
  return Result.ok(cleaned);
}

export class Goal extends AggregateRoot<GoalProps> {
  static create(input: CreateGoalProps, id?: UniqueEntityId): Result<Goal, CreateGoalError> {
    const title = Guard.againstEmpty(input.title, "title");
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    const guards = Result.combine([title, workspaceId]);
    if (guards.isFailure) {
      return Result.fail(guards.error);
    }
    if (input.owner.type !== "HUMAN" && input.owner.type !== "AGENT") {
      return Result.fail(new IncompatibleGoalOwnerError(input.owner.type));
    }
    const criteria = normalizeCriteria(input.successCriteria);
    if (criteria.isFailure) {
      return Result.fail(criteria.error);
    }

    const goal = new Goal(
      {
        workspaceId: workspaceId.value,
        parentGoalId: input.parentGoalId ?? null,
        title: title.value,
        description: input.description?.trim() || null,
        successCriteria: criteria.value,
        dependsOnGoalIds: [],
        priority: input.priority ?? DEFAULT_PRIORITY,
        owner: input.owner,
        progress: 0,
        status: "PLANNED",
        createdAt: input.now,
        updatedAt: input.now,
      },
      id,
    );
    goal.addDomainEvent(
      new GoalCreated(goal.id.value, input.now, workspaceId.value, goal.parentGoalId),
    );
    return Result.ok(goal);
  }

  /** Rebuild from persistence — never raises events. */
  static reconstitute(props: GoalProps, id: string): Goal {
    return new Goal(props, new UniqueEntityId(id));
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get parentGoalId(): string | null {
    return this.props.parentGoalId;
  }

  get title(): string {
    return this.props.title;
  }

  get description(): string | null {
    return this.props.description;
  }

  get successCriteria(): readonly string[] {
    return [...this.props.successCriteria];
  }

  get dependsOnGoalIds(): readonly string[] {
    return [...this.props.dependsOnGoalIds];
  }

  get priority(): Priority {
    return this.props.priority;
  }

  get owner(): ActorRef {
    return this.props.owner;
  }

  get progress(): number {
    return this.props.progress;
  }

  get status(): GoalStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  updateDetails(
    patch: UpdateGoalDetailsProps,
    now: Date,
  ): Result<void, UpdateGoalDetailsError> {
    if (STATUS_MACHINE.isTerminal(this.props.status)) {
      return Result.fail(new GoalNotEditableError(this.props.status));
    }
    let nextTitle = this.props.title;
    if (patch.title !== undefined) {
      const title = Guard.againstEmpty(patch.title, "title");
      if (title.isFailure) {
        return Result.fail(title.error);
      }
      nextTitle = title.value;
    }
    let nextCriteria = this.props.successCriteria;
    if (patch.successCriteria !== undefined) {
      const criteria = normalizeCriteria(patch.successCriteria);
      if (criteria.isFailure) {
        return Result.fail(criteria.error);
      }
      nextCriteria = criteria.value;
    }

    this.props.title = nextTitle;
    this.props.successCriteria = nextCriteria;
    if (patch.description !== undefined) {
      this.props.description = patch.description.trim() || null;
    }
    if (patch.priority !== undefined) {
      this.props.priority = patch.priority;
    }
    this.props.updatedAt = now;
    this.addDomainEvent(new GoalUpdated(this.id.value, now));
    return Result.ok(undefined);
  }

  /**
   * §22.6 semantics — and COMPLETED is categorically refused here: completion
   * is an approval, carried by complete() behind a human-only permission.
   */
  changeStatus(
    next: GoalStatus,
    now: Date,
  ): Result<void, InvalidStateTransitionError | CompletionRequiresApprovalError> {
    if (next === "COMPLETED") {
      return Result.fail(new CompletionRequiresApprovalError());
    }
    return this.transitionTo(next, now);
  }

  /** The only path to COMPLETED — from REVIEW, forcing progress to 100. */
  complete(now: Date): Result<void, InvalidStateTransitionError> {
    const transitioned = this.transitionTo("COMPLETED", now);
    if (transitioned.isFailure) {
      return transitioned;
    }
    this.props.progress = 100;
    return Result.ok(undefined);
  }

  /**
   * §5.6 dependencies. Cross-goal validity (existence, same workspace, no
   * cycle) is the application's job — the aggregate only knows opaque ids.
   */
  addDependency(
    dependsOnGoalId: string,
    now: Date,
  ): Result<void, GoalDependencyError | GoalNotEditableError> {
    if (STATUS_MACHINE.isTerminal(this.props.status)) {
      return Result.fail(new GoalNotEditableError(this.props.status));
    }
    if (dependsOnGoalId === this.id.value) {
      return Result.fail(new GoalDependencyError("a goal cannot depend on itself"));
    }
    if (this.props.dependsOnGoalIds.includes(dependsOnGoalId)) {
      return Result.ok(undefined);
    }

    this.props.dependsOnGoalIds.push(dependsOnGoalId);
    this.props.updatedAt = now;
    this.addDomainEvent(new GoalDependencyAdded(this.id.value, now, dependsOnGoalId));
    return Result.ok(undefined);
  }

  removeDependency(
    dependsOnGoalId: string,
    now: Date,
  ): Result<void, GoalNotEditableError> {
    if (STATUS_MACHINE.isTerminal(this.props.status)) {
      return Result.fail(new GoalNotEditableError(this.props.status));
    }
    const index = this.props.dependsOnGoalIds.indexOf(dependsOnGoalId);
    if (index === -1) {
      return Result.ok(undefined);
    }

    this.props.dependsOnGoalIds.splice(index, 1);
    this.props.updatedAt = now;
    this.addDomainEvent(new GoalDependencyRemoved(this.id.value, now, dependsOnGoalId));
    return Result.ok(undefined);
  }

  updateProgress(value: number, now: Date): Result<void, GuardViolation> {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return Result.fail(new GuardViolation("progress", "must be between 0 and 100"));
    }
    if (value === this.props.progress) {
      return Result.ok(undefined);
    }
    this.props.progress = value;
    this.props.updatedAt = now;
    this.addDomainEvent(new GoalProgressUpdated(this.id.value, now, value));
    return Result.ok(undefined);
  }

  /** §20.6 — COMPLETED is never listed: it is an approval, not a status pick. */
  allowedStatusTargets(): readonly GoalStatus[] {
    return STATUS_MACHINE.allowedFrom(this.props.status).filter(
      (status) => status !== "COMPLETED",
    );
  }

  private transitionTo(
    next: GoalStatus,
    now: Date,
  ): Result<void, InvalidStateTransitionError> {
    const outcome = STATUS_MACHINE.transition(this.props.status, next);
    switch (outcome.kind) {
      case "alreadyInState":
        return Result.ok(undefined);
      case "invalidTransition":
        return Result.fail(new InvalidStateTransitionError("Goal", outcome));
      case "transitioned": {
        const from = this.props.status;
        this.props.status = outcome.to;
        this.props.updatedAt = now;
        this.addDomainEvent(new GoalStatusChanged(this.id.value, now, from, outcome.to));
        return Result.ok(undefined);
      }
    }
  }
}
