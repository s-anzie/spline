import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { StateMachine } from "../../../kernel/domain/state-machine";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";

/** §11.6 */
export const VALIDATION_STATUSES = [
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "SKIPPED",
] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

/**
 * A verdict is terminal. There is no way back to PENDING, including for
 * §11.8 revalidation: reusing the row would erase what was proven, and §11.1
 * requires the history to be kept. An invalidated validation keeps its status
 * and stops counting; a new one is requested alongside it.
 *
 * A verdict may land without an explicit RUNNING: a human approving does not
 * "run".
 */
const STATUS_MACHINE = new StateMachine<ValidationStatus>({
  PENDING: ["RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "SKIPPED"],
  RUNNING: ["SUCCEEDED", "FAILED", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
  SKIPPED: [],
});

export class ValidationRequested extends BaseDomainEvent {
  readonly eventName = "validation.requested";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly taskId: string,
    readonly type: string,
    readonly mandatory: boolean,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class ValidationSucceeded extends BaseDomainEvent {
  readonly eventName = "validation.succeeded";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly taskId: string,
    readonly type: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

/** §17.9 names "Validation Failed" an alert; severityFor() reads the suffix. */
export class ValidationFailed extends BaseDomainEvent {
  readonly eventName = "validation.failed";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly taskId: string,
    readonly type: string,
    readonly requestedBy: ActorRef,
    readonly output: string | null,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class ValidationInvalidated extends BaseDomainEvent {
  readonly eventName = "validation.invalidated";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly taskId: string,
    readonly reason: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class ValidationSettled extends BaseDomainEvent {
  readonly eventName = "validation.settled";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly taskId: string,
    readonly status: ValidationStatus,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

interface ValidationProps {
  workspaceId: string;
  taskId: string;
  type: string;
  status: ValidationStatus;
  mandatory: boolean;
  requestedBy: ActorRef;
  executedBy: ActorRef | null;
  output: string | null;
  reportArtifactIds: string[];
  dependsOnValidationIds: string[];
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  invalidatedAt: Date | null;
  invalidationReason: string | null;
}

export interface RequestValidationProps {
  workspaceId: string;
  taskId: string;
  /** §11.2 — an open list, extensible through the registry (§19). */
  type: string;
  mandatory: boolean;
  requestedBy: ActorRef;
  now: Date;
  dependsOnValidationIds?: readonly string[];
}

export interface RecordVerdictProps {
  outcome: "SUCCEEDED" | "FAILED";
  executedBy: ActorRef;
  now: Date;
  output?: string;
  reportArtifactIds?: readonly string[];
}

/**
 * §4.9 — the proof. A task is never finished without one, and §10.9 forbids
 * an agent from declaring its own success: it submits, something else judges.
 */
export class Validation extends AggregateRoot<ValidationProps> {
  static request(
    input: RequestValidationProps,
    id?: UniqueEntityId,
  ): Result<Validation, GuardViolation> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    const taskId = Guard.againstEmpty(input.taskId, "taskId");
    if (taskId.isFailure) {
      return Result.fail(taskId.error);
    }
    const type = Guard.againstEmpty(input.type, "type");
    if (type.isFailure) {
      return Result.fail(type.error);
    }

    const validation = new Validation(
      {
        workspaceId: workspaceId.value,
        taskId: taskId.value,
        type: type.value,
        status: "PENDING",
        mandatory: input.mandatory,
        requestedBy: input.requestedBy,
        executedBy: null,
        output: null,
        reportArtifactIds: [],
        dependsOnValidationIds: [...(input.dependsOnValidationIds ?? [])],
        createdAt: input.now,
        startedAt: null,
        finishedAt: null,
        invalidatedAt: null,
        invalidationReason: null,
      },
      id,
    );
    validation.addDomainEvent(
      new ValidationRequested(
        validation.id.value,
        input.now,
        workspaceId.value,
        taskId.value,
        type.value,
        input.mandatory,
      ),
    );
    return Result.ok(validation);
  }

  static reconstitute(props: ValidationProps, id: string): Validation {
    return new Validation(props, new UniqueEntityId(id));
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get taskId(): string {
    return this.props.taskId;
  }

  get type(): string {
    return this.props.type;
  }

  get status(): ValidationStatus {
    return this.props.status;
  }

  get mandatory(): boolean {
    return this.props.mandatory;
  }

  get requestedBy(): ActorRef {
    return this.props.requestedBy;
  }

  get executedBy(): ActorRef | null {
    return this.props.executedBy;
  }

  get output(): string | null {
    return this.props.output;
  }

  get reportArtifactIds(): readonly string[] {
    return [...this.props.reportArtifactIds];
  }

  get dependsOnValidationIds(): readonly string[] {
    return [...this.props.dependsOnValidationIds];
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get startedAt(): Date | null {
    return this.props.startedAt;
  }

  get finishedAt(): Date | null {
    return this.props.finishedAt;
  }

  get invalidatedAt(): Date | null {
    return this.props.invalidatedAt;
  }

  get invalidationReason(): string | null {
    return this.props.invalidationReason;
  }

  get isInvalidated(): boolean {
    return this.props.invalidatedAt !== null;
  }

  /**
   * Whether this validation currently stands as proof (§11.7).
   *
   * SKIPPED counts: skipping a mandatory validation is a deliberate
   * exemption, recorded with its reason, and letting it keep blocking would
   * make the act pointless. FAILED and PENDING do not. Neither does anything
   * invalidated (§11.8) — that is the entire purpose of invalidating it.
   */
  satisfies(): boolean {
    if (this.isInvalidated) {
      return false;
    }
    return this.props.status === "SUCCEEDED" || this.props.status === "SKIPPED";
  }

  start(now: Date): Result<void, InvalidStateTransitionError> {
    return this.transitionTo("RUNNING", now);
  }

  record(input: RecordVerdictProps): Result<void, InvalidStateTransitionError> {
    const moved = this.transitionTo(input.outcome, input.now);
    if (moved.isFailure) {
      return moved;
    }
    this.props.executedBy = input.executedBy;
    this.props.output = input.output ?? null;
    this.props.reportArtifactIds = [...(input.reportArtifactIds ?? [])];
    this.props.finishedAt = input.now;

    this.addDomainEvent(
      input.outcome === "SUCCEEDED"
        ? new ValidationSucceeded(
            this.id.value,
            input.now,
            this.props.workspaceId,
            this.props.taskId,
            this.props.type,
          )
        : new ValidationFailed(
            this.id.value,
            input.now,
            this.props.workspaceId,
            this.props.taskId,
            this.props.type,
            this.props.requestedBy,
            this.props.output,
          ),
    );
    return Result.ok(undefined);
  }

  /** An exemption, with its reason on record — never a silent pass. */
  skip(reason: string, now: Date): Result<void, InvalidStateTransitionError> {
    const moved = this.transitionTo("SKIPPED", now);
    if (moved.isFailure) {
      return moved;
    }
    this.props.output = reason;
    this.props.finishedAt = now;
    this.addDomainEvent(
      new ValidationSettled(
        this.id.value,
        now,
        this.props.workspaceId,
        this.props.taskId,
        "SKIPPED",
      ),
    );
    return Result.ok(undefined);
  }

  cancel(now: Date): Result<void, InvalidStateTransitionError> {
    const moved = this.transitionTo("CANCELLED", now);
    if (moved.isFailure) {
      return moved;
    }
    this.props.finishedAt = now;
    this.addDomainEvent(
      new ValidationSettled(
        this.id.value,
        now,
        this.props.workspaceId,
        this.props.taskId,
        "CANCELLED",
      ),
    );
    return Result.ok(undefined);
  }

  /**
   * §11.8 — the proof no longer holds. Idempotent: invalidating twice is not
   * an error, and the first reason is the one kept.
   */
  invalidate(reason: string, now: Date): Result<void, GuardViolation> {
    const checked = Guard.againstEmpty(reason, "reason");
    if (checked.isFailure) {
      return Result.fail(checked.error);
    }
    if (this.isInvalidated) {
      return Result.ok(undefined);
    }
    this.props.invalidatedAt = now;
    this.props.invalidationReason = checked.value;
    this.addDomainEvent(
      new ValidationInvalidated(
        this.id.value,
        now,
        this.props.workspaceId,
        this.props.taskId,
        checked.value,
      ),
    );
    return Result.ok(undefined);
  }

  allowedStatusTargets(): readonly ValidationStatus[] {
    return STATUS_MACHINE.allowedFrom(this.props.status);
  }

  private transitionTo(
    next: ValidationStatus,
    now: Date,
  ): Result<void, InvalidStateTransitionError> {
    const outcome = STATUS_MACHINE.transition(this.props.status, next);
    switch (outcome.kind) {
      case "alreadyInState":
        return Result.ok(undefined);
      case "invalidTransition":
        return Result.fail(new InvalidStateTransitionError("Validation", outcome));
      case "transitioned":
        this.props.status = outcome.to;
        if (outcome.to === "RUNNING") {
          this.props.startedAt = now;
        }
        return Result.ok(undefined);
    }
  }
}
