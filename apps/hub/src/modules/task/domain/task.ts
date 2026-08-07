import { randomUUID } from "node:crypto";

import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { DEFAULT_PRIORITY, Priority } from "../../../kernel/domain/priority";
import { Result } from "../../../kernel/domain/result";
import { StateMachine } from "../../../kernel/domain/state-machine";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";
import { Blocker, ReportBlockerInput } from "./blocker";
import {
  TaskAssigned,
  TaskBlockerReported,
  TaskBlockerResolved,
  TaskCreated,
  TaskDependencyAdded,
  TaskDependencyRemoved,
  TaskStatusChanged,
  TaskUpdated,
} from "./task-events";
import {
  BlockerAlreadyResolvedError,
  BlockerNotFoundError,
  CompletionRequiresValidationError,
  EmptyAcceptanceCriteriaError,
  IncompatibleAssigneeError,
  TaskDependencyError,
  TaskNotEditableError,
} from "./task.errors";

/**
 * The nine statuses of §4.6 — no more. SCHEDULED / RETRYING / PAUSED /
 * WAITING_APPROVAL from §9.6 describe scheduling and attempts, not the task
 * itself, and belong to the execution module.
 */
export const TASK_STATUSES = [
  "PLANNED",
  "READY",
  "ASSIGNED",
  "RUNNING",
  "BLOCKED",
  "VALIDATING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * An obstacle can strike any live task, so BLOCKED is reachable from every
 * non-terminal state and returns to any of them — the table must say so, or
 * allowedStatusTargets() would advertise less than reportBlocker actually does.
 */
const STATUS_MACHINE = new StateMachine<TaskStatus>({
  PLANNED: ["READY", "BLOCKED", "CANCELLED"],
  READY: ["ASSIGNED", "BLOCKED", "CANCELLED"],
  ASSIGNED: ["RUNNING", "BLOCKED", "CANCELLED"],
  RUNNING: ["VALIDATING", "BLOCKED", "FAILED", "CANCELLED"],
  BLOCKED: ["PLANNED", "READY", "ASSIGNED", "RUNNING", "VALIDATING", "CANCELLED"],
  VALIDATING: ["COMPLETED", "RUNNING", "BLOCKED", "FAILED", "CANCELLED"],
  FAILED: ["ASSIGNED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
});

interface TaskProps {
  workspaceId: string;
  goalId: string;
  repositoryId: string | null;
  title: string;
  description: string | null;
  acceptanceCriteria: string[];
  dependsOnTaskIds: string[];
  blockers: Blocker[];
  assignee: ActorRef;
  priority: Priority;
  status: TaskStatus;
  /** Where the task was when it got blocked, so it resumes instead of restarting. */
  statusBeforeBlock: TaskStatus | null;
  estimatedCost: number | null;
  estimatedDurationMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskProps {
  workspaceId: string;
  goalId: string;
  repositoryId?: string;
  title: string;
  description?: string;
  acceptanceCriteria: readonly string[];
  assignee: ActorRef;
  priority?: Priority;
  estimatedCost?: number;
  estimatedDurationMinutes?: number;
  now: Date;
}

export interface UpdateTaskDetailsProps {
  title?: string;
  description?: string;
  acceptanceCriteria?: readonly string[];
  priority?: Priority;
  estimatedCost?: number;
  estimatedDurationMinutes?: number;
  repositoryId?: string;
}

export type CreateTaskError =
  | GuardViolation
  | EmptyAcceptanceCriteriaError
  | IncompatibleAssigneeError;

export type UpdateTaskDetailsError =
  | GuardViolation
  | EmptyAcceptanceCriteriaError
  | TaskNotEditableError;

function normalizeCriteria(
  criteria: readonly string[],
): Result<string[], EmptyAcceptanceCriteriaError> {
  const cleaned = criteria.map((criterion) => criterion.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return Result.fail(new EmptyAcceptanceCriteriaError());
  }
  return Result.ok(cleaned);
}

/** Only humans and agents carry out work; workers execute, they do not own. */
function assertExecutor(actor: ActorRef): Result<void, IncompatibleAssigneeError> {
  if (actor.type !== "HUMAN" && actor.type !== "AGENT") {
    return Result.fail(new IncompatibleAssigneeError(actor.type));
  }
  return Result.ok(undefined);
}

export class Task extends AggregateRoot<TaskProps> {
  static create(input: CreateTaskProps, id?: UniqueEntityId): Result<Task, CreateTaskError> {
    const title = Guard.againstEmpty(input.title, "title");
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    const goalId = Guard.againstEmpty(input.goalId, "goalId");
    const guards = Result.combine([title, workspaceId, goalId]);
    if (guards.isFailure) {
      return Result.fail(guards.error);
    }
    const executor = assertExecutor(input.assignee);
    if (executor.isFailure) {
      return Result.fail(executor.error);
    }
    const criteria = normalizeCriteria(input.acceptanceCriteria);
    if (criteria.isFailure) {
      return Result.fail(criteria.error);
    }
    const estimates = Result.combine([
      input.estimatedCost === undefined
        ? Result.ok(0)
        : Guard.againstNegative(input.estimatedCost, "estimatedCost"),
      input.estimatedDurationMinutes === undefined
        ? Result.ok(0)
        : Guard.againstNegative(input.estimatedDurationMinutes, "estimatedDurationMinutes"),
    ]);
    if (estimates.isFailure) {
      return Result.fail(estimates.error);
    }

    const task = new Task(
      {
        workspaceId: workspaceId.value,
        goalId: goalId.value,
        repositoryId: input.repositoryId ?? null,
        title: title.value,
        description: input.description?.trim() || null,
        acceptanceCriteria: criteria.value,
        dependsOnTaskIds: [],
        blockers: [],
        // §4.6: an assignee exists from the first instant — there is never a
        // window where several actors could volunteer for the same task.
        assignee: input.assignee,
        priority: input.priority ?? DEFAULT_PRIORITY,
        status: "PLANNED",
        statusBeforeBlock: null,
        estimatedCost: input.estimatedCost ?? null,
        estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
        createdAt: input.now,
        updatedAt: input.now,
      },
      id,
    );
    task.addDomainEvent(
      new TaskCreated(
        task.id.value,
        input.now,
        workspaceId.value,
        goalId.value,
        input.assignee,
        title.value,
      ),
    );
    return Result.ok(task);
  }

  /** Rebuild from persistence — never raises events. */
  static reconstitute(props: TaskProps, id: string): Task {
    return new Task(props, new UniqueEntityId(id));
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get goalId(): string {
    return this.props.goalId;
  }

  get repositoryId(): string | null {
    return this.props.repositoryId;
  }

  get title(): string {
    return this.props.title;
  }

  get description(): string | null {
    return this.props.description;
  }

  get acceptanceCriteria(): readonly string[] {
    return [...this.props.acceptanceCriteria];
  }

  get dependsOnTaskIds(): readonly string[] {
    return [...this.props.dependsOnTaskIds];
  }

  get blockers(): readonly Blocker[] {
    return [...this.props.blockers];
  }

  get openBlockers(): readonly Blocker[] {
    return this.props.blockers.filter((blocker) => blocker.resolvedAt === null);
  }

  get assignee(): ActorRef {
    return this.props.assignee;
  }

  get priority(): Priority {
    return this.props.priority;
  }

  get status(): TaskStatus {
    return this.props.status;
  }

  get estimatedCost(): number | null {
    return this.props.estimatedCost;
  }

  get estimatedDurationMinutes(): number | null {
    return this.props.estimatedDurationMinutes;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** Persistence needs it; behaviour never reads it from outside. */
  get statusBeforeBlock(): TaskStatus | null {
    return this.props.statusBeforeBlock;
  }

  get isTerminal(): boolean {
    return STATUS_MACHINE.isTerminal(this.props.status);
  }

  /** Explicit reassignment — idempotent when the assignee does not change. */
  assignTo(
    assignee: ActorRef,
    now: Date,
  ): Result<void, IncompatibleAssigneeError | TaskNotEditableError> {
    if (this.isTerminal) {
      return Result.fail(new TaskNotEditableError(this.props.status));
    }
    const executor = assertExecutor(assignee);
    if (executor.isFailure) {
      return Result.fail(executor.error);
    }
    if (assignee.equals(this.props.assignee)) {
      return Result.ok(undefined);
    }

    this.props.assignee = assignee;
    this.props.updatedAt = now;
    this.addDomainEvent(
      new TaskAssigned(this.id.value, now, this.props.workspaceId, assignee, this.props.title),
    );
    return Result.ok(undefined);
  }

  updateDetails(
    patch: UpdateTaskDetailsProps,
    now: Date,
  ): Result<void, UpdateTaskDetailsError> {
    if (this.isTerminal) {
      return Result.fail(new TaskNotEditableError(this.props.status));
    }
    let nextTitle = this.props.title;
    if (patch.title !== undefined) {
      const title = Guard.againstEmpty(patch.title, "title");
      if (title.isFailure) {
        return Result.fail(title.error);
      }
      nextTitle = title.value;
    }
    let nextCriteria = this.props.acceptanceCriteria;
    if (patch.acceptanceCriteria !== undefined) {
      const criteria = normalizeCriteria(patch.acceptanceCriteria);
      if (criteria.isFailure) {
        return Result.fail(criteria.error);
      }
      nextCriteria = criteria.value;
    }
    for (const [value, name] of [
      [patch.estimatedCost, "estimatedCost"],
      [patch.estimatedDurationMinutes, "estimatedDurationMinutes"],
    ] as const) {
      if (value !== undefined) {
        const guarded = Guard.againstNegative(value, name);
        if (guarded.isFailure) {
          return Result.fail(guarded.error);
        }
      }
    }

    this.props.title = nextTitle;
    this.props.acceptanceCriteria = nextCriteria;
    if (patch.description !== undefined) {
      this.props.description = patch.description.trim() || null;
    }
    if (patch.priority !== undefined) {
      this.props.priority = patch.priority;
    }
    if (patch.estimatedCost !== undefined) {
      this.props.estimatedCost = patch.estimatedCost;
    }
    if (patch.estimatedDurationMinutes !== undefined) {
      this.props.estimatedDurationMinutes = patch.estimatedDurationMinutes;
    }
    if (patch.repositoryId !== undefined) {
      this.props.repositoryId = patch.repositoryId || null;
    }
    this.props.updatedAt = now;
    this.addDomainEvent(new TaskUpdated(this.id.value, now, this.props.workspaceId));
    return Result.ok(undefined);
  }

  /**
   * §22.6 semantics, and COMPLETED is categorically refused: a task is never
   * completed without validation (§4.24). Use complete().
   */
  changeStatus(
    next: TaskStatus,
    now: Date,
  ): Result<void, InvalidStateTransitionError | CompletionRequiresValidationError> {
    if (next === "COMPLETED") {
      return Result.fail(new CompletionRequiresValidationError());
    }
    return this.transitionTo(next, now);
  }

  /** The only path to COMPLETED — from VALIDATING. */
  complete(now: Date): Result<void, InvalidStateTransitionError> {
    return this.transitionTo("COMPLETED", now);
  }

  reportBlocker(
    input: ReportBlockerInput,
    now: Date,
  ): Result<string, GuardViolation | TaskNotEditableError> {
    if (this.isTerminal) {
      return Result.fail(new TaskNotEditableError(this.props.status));
    }
    const description = Guard.againstEmpty(input.description, "description");
    if (description.isFailure) {
      return Result.fail(description.error);
    }

    // Remember where work stood, but only for the first blocker: a second
    // obstacle must not overwrite the status we will return to.
    if (this.props.status !== "BLOCKED") {
      this.props.statusBeforeBlock = this.props.status;
      this.props.status = "BLOCKED";
    }
    const blocker: Blocker = {
      id: randomUUID(),
      type: input.type,
      description: description.value,
      reportedBy: input.reportedBy,
      reportedAt: now,
      resolvedAt: null,
      resolution: null,
    };
    this.props.blockers.push(blocker);
    this.props.updatedAt = now;
    this.addDomainEvent(
      new TaskBlockerReported(
        this.id.value,
        now,
        this.props.workspaceId,
        blocker.id,
        blocker.type,
      ),
    );
    return Result.ok(blocker.id);
  }

  resolveBlocker(
    blockerId: string,
    resolution: string,
    now: Date,
  ): Result<void, BlockerNotFoundError | BlockerAlreadyResolvedError> {
    const blocker = this.props.blockers.find((candidate) => candidate.id === blockerId);
    if (!blocker) {
      return Result.fail(new BlockerNotFoundError(blockerId));
    }
    if (blocker.resolvedAt !== null) {
      return Result.fail(new BlockerAlreadyResolvedError());
    }

    blocker.resolvedAt = now;
    blocker.resolution = resolution.trim() || null;
    this.props.updatedAt = now;
    this.addDomainEvent(new TaskBlockerResolved(this.id.value, now, this.props.workspaceId, blockerId));

    // The last obstacle cleared: resume where the work actually stood.
    if (this.openBlockers.length === 0 && this.props.status === "BLOCKED") {
      const restored = this.props.statusBeforeBlock ?? "READY";
      this.props.statusBeforeBlock = null;
      this.props.status = restored;
      this.addDomainEvent(
        new TaskStatusChanged(
          this.id.value,
          now,
          this.props.workspaceId,
          this.props.goalId,
          "BLOCKED",
          restored,
        ),
      );
    }
    return Result.ok(undefined);
  }

  addDependency(
    dependsOnTaskId: string,
    now: Date,
  ): Result<void, TaskDependencyError | TaskNotEditableError> {
    if (this.isTerminal) {
      return Result.fail(new TaskNotEditableError(this.props.status));
    }
    if (dependsOnTaskId === this.id.value) {
      return Result.fail(new TaskDependencyError("a task cannot depend on itself"));
    }
    if (this.props.dependsOnTaskIds.includes(dependsOnTaskId)) {
      return Result.ok(undefined);
    }

    this.props.dependsOnTaskIds.push(dependsOnTaskId);
    this.props.updatedAt = now;
    this.addDomainEvent(new TaskDependencyAdded(this.id.value, now, this.props.workspaceId, dependsOnTaskId));
    return Result.ok(undefined);
  }

  removeDependency(
    dependsOnTaskId: string,
    now: Date,
  ): Result<void, TaskNotEditableError> {
    if (this.isTerminal) {
      return Result.fail(new TaskNotEditableError(this.props.status));
    }
    const index = this.props.dependsOnTaskIds.indexOf(dependsOnTaskId);
    if (index === -1) {
      return Result.ok(undefined);
    }

    this.props.dependsOnTaskIds.splice(index, 1);
    this.props.updatedAt = now;
    this.addDomainEvent(new TaskDependencyRemoved(this.id.value, now, this.props.workspaceId, dependsOnTaskId));
    return Result.ok(undefined);
  }

  /** §20.6 — COMPLETED is never listed: it is an approval, not a status pick. */
  allowedStatusTargets(): readonly TaskStatus[] {
    return STATUS_MACHINE.allowedFrom(this.props.status).filter(
      (status) => status !== "COMPLETED",
    );
  }

  private transitionTo(
    next: TaskStatus,
    now: Date,
  ): Result<void, InvalidStateTransitionError> {
    const outcome = STATUS_MACHINE.transition(this.props.status, next);
    switch (outcome.kind) {
      case "alreadyInState":
        return Result.ok(undefined);
      case "invalidTransition":
        return Result.fail(new InvalidStateTransitionError("Task", outcome));
      case "transitioned": {
        const from = this.props.status;
        this.props.status = outcome.to;
        if (from === "BLOCKED") {
          this.props.statusBeforeBlock = null;
        }
        this.props.updatedAt = now;
        this.addDomainEvent(
          new TaskStatusChanged(
            this.id.value,
            now,
            this.props.workspaceId,
            this.props.goalId,
            from,
            outcome.to,
          ),
        );
        return Result.ok(undefined);
      }
    }
  }
}
