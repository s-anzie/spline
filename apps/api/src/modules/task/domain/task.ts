import { ActorType, Priority, TaskStatus, ValidationState } from "@repo/db";

import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { TaskAssigned, TaskBlocked, TaskCompleted, TaskCreated, TaskStatusChanged } from "./task-events";
import {
  EmptyBlockerReasonError,
  EmptyTaskTitleError,
  InvalidTaskStatusTransitionError,
  SelfTaskDependencyError,
  TaskValidationNotPendingError,
} from "./task.errors";

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.BACKLOG]: [TaskStatus.TODO, TaskStatus.CANCELLED],
  [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.CANCELLED],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.BLOCKED, TaskStatus.IN_REVIEW, TaskStatus.CANCELLED],
  [TaskStatus.BLOCKED]: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
  [TaskStatus.IN_REVIEW]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.CANCELLED],
  [TaskStatus.DONE]: [],
  [TaskStatus.CANCELLED]: [],
};

export interface TaskBlocker {
  reason: string;
  reportedByType: ActorType;
  reportedById: string;
  reportedAt: string;
  resolvedAt?: string;
}

export interface Actor {
  type: ActorType;
  id: string;
}

export interface TaskProps {
  workspaceId: string;
  goalId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  assigneeType?: ActorType;
  assigneeId?: string;
  dependencies: string[];
  blockers: TaskBlocker[];
  validationState: ValidationState;
  createdByType: ActorType;
  createdById: string;
  updatedByType?: ActorType;
  updatedById?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskProps {
  workspaceId: string;
  goalId?: string;
  title: string;
  description?: string;
  priority?: Priority;
  dependencies?: string[];
  createdByType: ActorType;
  createdById: string;
}

export interface UpdateTaskDetailsProps {
  title?: string;
  description?: string;
  priority?: Priority;
  dependencies?: string[];
}

function normalizeTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new EmptyTaskTitleError();
  }
  return trimmed;
}

export class Task extends AggregateRoot<TaskProps> {
  static create(props: CreateTaskProps, id?: UniqueEntityId): Task {
    const now = new Date();
    const task = new Task(
      {
        workspaceId: props.workspaceId,
        goalId: props.goalId,
        title: normalizeTitle(props.title),
        description: props.description,
        status: TaskStatus.BACKLOG,
        priority: props.priority ?? Priority.MEDIUM,
        dependencies: props.dependencies ?? [],
        blockers: [],
        validationState: ValidationState.NOT_REQUIRED,
        createdByType: props.createdByType,
        createdById: props.createdById,
        createdAt: now,
        updatedAt: now,
      },
      id,
    );
    task.record(new TaskCreated(task.props.workspaceId, task.id.toString(), task.props.goalId));
    return task;
  }

  static reconstitute(props: TaskProps, id: UniqueEntityId): Task {
    return new Task(props, id);
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get goalId(): string | undefined {
    return this.props.goalId;
  }

  get title(): string {
    return this.props.title;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get status(): TaskStatus {
    return this.props.status;
  }

  get priority(): Priority {
    return this.props.priority;
  }

  get assigneeType(): ActorType | undefined {
    return this.props.assigneeType;
  }

  get assigneeId(): string | undefined {
    return this.props.assigneeId;
  }

  get dependencies(): readonly string[] {
    return this.props.dependencies;
  }

  get blockers(): readonly TaskBlocker[] {
    return this.props.blockers;
  }

  get validationState(): ValidationState {
    return this.props.validationState;
  }

  get createdByType(): ActorType {
    return this.props.createdByType;
  }

  get createdById(): string {
    return this.props.createdById;
  }

  get updatedByType(): ActorType | undefined {
    return this.props.updatedByType;
  }

  get updatedById(): string | undefined {
    return this.props.updatedById;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  private touch(updatedBy: Actor, at: Date = new Date()): void {
    this.props.updatedByType = updatedBy.type;
    this.props.updatedById = updatedBy.id;
    this.props.updatedAt = at;
  }

  updateDetails(props: UpdateTaskDetailsProps, updatedBy: Actor): void {
    if (props.title !== undefined) {
      this.props.title = normalizeTitle(props.title);
    }
    if (props.description !== undefined) {
      this.props.description = props.description;
    }
    if (props.priority !== undefined) {
      this.props.priority = props.priority;
    }
    if (props.dependencies !== undefined) {
      if (props.dependencies.includes(this.id.toString())) {
        throw new SelfTaskDependencyError(this.id.toString());
      }
      this.props.dependencies = props.dependencies;
    }
    this.touch(updatedBy);
  }

  assign(assigneeType: ActorType, assigneeId: string, updatedBy: Actor): void {
    this.props.assigneeType = assigneeType;
    this.props.assigneeId = assigneeId;
    this.touch(updatedBy);
    this.record(new TaskAssigned(this.props.workspaceId, this.id.toString(), assigneeType, assigneeId));
  }

  changeStatus(next: TaskStatus, updatedBy: Actor): void {
    const current = this.props.status;
    if (!ALLOWED_TRANSITIONS[current].includes(next)) {
      throw new InvalidTaskStatusTransitionError(current, next);
    }

    if (current === TaskStatus.BLOCKED && next !== TaskStatus.BLOCKED) {
      const now = new Date().toISOString();
      this.props.blockers = this.props.blockers.map((blocker) =>
        blocker.resolvedAt ? blocker : { ...blocker, resolvedAt: now },
      );
    }

    this.props.status = next;
    if (next === TaskStatus.IN_REVIEW) {
      this.props.validationState = ValidationState.PENDING;
    }
    this.touch(updatedBy);
    this.record(new TaskStatusChanged(this.props.workspaceId, this.id.toString(), current, next));
  }

  reportBlocker(reason: string, reporter: Actor): void {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new EmptyBlockerReasonError();
    }

    const now = new Date();
    this.props.blockers = [
      ...this.props.blockers,
      {
        reason: trimmedReason,
        reportedByType: reporter.type,
        reportedById: reporter.id,
        reportedAt: now.toISOString(),
      },
    ];

    if (this.props.status !== TaskStatus.BLOCKED) {
      this.changeStatus(TaskStatus.BLOCKED, reporter);
    } else {
      this.touch(reporter, now);
    }

    this.record(new TaskBlocked(this.props.workspaceId, this.id.toString(), trimmedReason));
  }

  validate(updatedBy: Actor): void {
    if (this.props.status !== TaskStatus.IN_REVIEW) {
      throw new TaskValidationNotPendingError(this.id.toString());
    }
    const from = this.props.status;
    this.props.status = TaskStatus.DONE;
    this.props.validationState = ValidationState.VALIDATED;
    this.touch(updatedBy);
    this.record(new TaskStatusChanged(this.props.workspaceId, this.id.toString(), from, TaskStatus.DONE));
    this.record(new TaskCompleted(this.props.workspaceId, this.id.toString(), this.props.goalId));
  }

  reject(updatedBy: Actor): void {
    if (this.props.status !== TaskStatus.IN_REVIEW) {
      throw new TaskValidationNotPendingError(this.id.toString());
    }
    const from = this.props.status;
    this.props.status = TaskStatus.IN_PROGRESS;
    this.props.validationState = ValidationState.REJECTED;
    this.touch(updatedBy);
    this.record(
      new TaskStatusChanged(this.props.workspaceId, this.id.toString(), from, TaskStatus.IN_PROGRESS),
    );
  }
}
