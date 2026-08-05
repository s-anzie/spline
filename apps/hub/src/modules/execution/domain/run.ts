import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { StateMachine } from "../../../kernel/domain/state-machine";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import {
  AttemptAlreadyInFlightError,
  AttemptNotResumableError,
  NoAttemptInFlightError,
} from "./execution.errors";

/** §4.7 */
export const RUN_STATUSES = [
  "PENDING",
  "RUNNING",
  "VALIDATING",
  "COMPLETED",
  "FAILED",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const ATTEMPT_OUTCOMES = ["COMPLETED", "FAILED", "ABANDONED"] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];

/**
 * VALIDATING sits between RUNNING and COMPLETED because §11 is categorical:
 * "les agents ne déclarent jamais eux-mêmes une réussite". A run that could
 * go straight to COMPLETED would be a run that declares its own success.
 */
const STATUS_MACHINE = new StateMachine<RunStatus>({
  PENDING: ["RUNNING", "FAILED"],
  RUNNING: ["VALIDATING", "FAILED"],
  VALIDATING: ["COMPLETED", "RUNNING", "FAILED"],
  COMPLETED: [],
  FAILED: [],
});

/** §4.8 — what one execution actually consumed. */
export interface Attempt {
  id: string;
  number: number;
  provider: string;
  model: string | null;
  promptVersion: string | null;
  tokenUsage: Record<string, number> | null;
  cost: number | null;
  durationMs: number | null;
  outcome: AttemptOutcome | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface BeginAttemptInput {
  workerId: string;
  provider: string;
  model?: string;
  promptVersion?: string;
}

export interface FinishAttemptInput {
  outcome: AttemptOutcome;
  tokenUsage?: Record<string, number>;
  cost?: number;
}

export class RunStarted extends BaseDomainEvent {
  readonly eventName = "execution.run_started";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly taskId: string,
    readonly attemptNumber: number,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class RunFinished extends BaseDomainEvent {
  readonly eventName = "execution.run_finished";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly taskId: string,
    readonly status: RunStatus,
    readonly failureReason: string | null,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

interface RunProps {
  workspaceId: string;
  taskId: string;
  /**
   * Which retry this is, counted across the task's runs. §9.12 makes every
   * retry a NEW run, so the number lives on the run rather than being derived
   * by counting rows — a count is a query that can disagree with itself under
   * concurrency.
   */
  attemptNumber: number;
  workerId: string | null;
  status: RunStatus;
  attempts: Attempt[];
  failureReason: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export interface StartRunProps {
  workspaceId: string;
  taskId: string;
  attemptNumber: number;
  now: Date;
}

/**
 * §4.7 — one logical execution of a task.
 *
 * The history is the point (§9.12: "L'historique est conservé"). A task that
 * failed three times has three runs, each carrying what it cost and which
 * provider carried it — which is what makes "why does this task keep failing"
 * a question with an answer.
 *
 * Attempts are entities INSIDE this aggregate, not aggregates of their own:
 * an attempt has no life outside its run, the same reason blockers live
 * inside a task (§4.22). The whole thing is persisted together (§5.19).
 */
export class Run extends AggregateRoot<RunProps> {
  static start(input: StartRunProps, id?: UniqueEntityId): Result<Run, GuardViolation> {
    for (const [value, name] of [
      [input.workspaceId, "workspaceId"],
      [input.taskId, "taskId"],
    ] as const) {
      const guarded = Guard.againstEmpty(value, name);
      if (guarded.isFailure) {
        return Result.fail(guarded.error);
      }
    }

    const run = new Run(
      {
        workspaceId: input.workspaceId,
        taskId: input.taskId.trim(),
        attemptNumber: input.attemptNumber,
        workerId: null,
        status: "PENDING",
        attempts: [],
        failureReason: null,
        startedAt: null,
        finishedAt: null,
        createdAt: input.now,
      },
      id,
    );
    run.addDomainEvent(
      new RunStarted(
        run.id.value,
        input.now,
        input.workspaceId,
        run.taskId,
        input.attemptNumber,
      ),
    );
    return Result.ok(run);
  }

  static reconstitute(props: RunProps, id: string): Run {
    return new Run(props, new UniqueEntityId(id));
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get taskId(): string {
    return this.props.taskId;
  }

  get attemptNumber(): number {
    return this.props.attemptNumber;
  }

  get workerId(): string | null {
    return this.props.workerId;
  }

  get status(): RunStatus {
    return this.props.status;
  }

  /** A copy: nobody mutates the history from outside. */
  get attempts(): readonly Attempt[] {
    return [...this.props.attempts];
  }

  get failureReason(): string | null {
    return this.props.failureReason;
  }

  get startedAt(): Date | null {
    return this.props.startedAt;
  }

  get finishedAt(): Date | null {
    return this.props.finishedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  private get inFlight(): Attempt | undefined {
    return this.props.attempts.find((attempt) => attempt.outcome === null);
  }

  beginAttempt(
    input: BeginAttemptInput,
    now: Date,
  ): Result<Attempt, InvalidStateTransitionError | AttemptAlreadyInFlightError> {
    if (this.inFlight) {
      return Result.fail(new AttemptAlreadyInFlightError(this.id.value));
    }
    const moved = this.transition("RUNNING");
    if (moved.isFailure) {
      return Result.fail(moved.error);
    }

    const attempt: Attempt = {
      id: new UniqueEntityId().value,
      number: this.props.attempts.length + 1,
      provider: input.provider,
      model: input.model ?? null,
      promptVersion: input.promptVersion ?? null,
      tokenUsage: null,
      cost: null,
      durationMs: null,
      outcome: null,
      startedAt: now,
      finishedAt: null,
    };
    this.props.attempts.push(attempt);
    this.props.workerId = input.workerId;
    this.props.startedAt ??= now;
    return Result.ok(attempt);
  }

  finishAttempt(
    input: FinishAttemptInput,
    now: Date,
  ): Result<void, NoAttemptInFlightError> {
    const attempt = this.inFlight;
    if (!attempt) {
      return Result.fail(new NoAttemptInFlightError(this.id.value));
    }
    attempt.outcome = input.outcome;
    attempt.tokenUsage = input.tokenUsage ?? null;
    attempt.cost = input.cost ?? null;
    attempt.finishedAt = now;
    attempt.durationMs = now.getTime() - attempt.startedAt.getTime();
    return Result.ok(undefined);
  }

  /**
   * §4.8's resume invariant. Asked BEFORE a resume is attempted, so the
   * refusal names the two providers rather than surfacing later as a
   * malformed context several layers away (0.3.11).
   */
  resumableBy(provider: string): Result<Attempt, AttemptNotResumableError> {
    const last = this.props.attempts.at(-1);
    if (!last) {
      return Result.fail(new AttemptNotResumableError("nothing", provider));
    }
    return last.provider === provider
      ? Result.ok(last)
      : Result.fail(new AttemptNotResumableError(last.provider, provider));
  }

  toValidating(now: Date): Result<void, InvalidStateTransitionError> {
    void now;
    return this.transition("VALIDATING");
  }

  complete(now: Date): Result<void, InvalidStateTransitionError> {
    const moved = this.transition("COMPLETED");
    if (moved.isFailure) {
      return moved;
    }
    this.props.finishedAt = now;
    this.announceFinish(now);
    return Result.ok(undefined);
  }

  fail(reason: string, now: Date): Result<void, InvalidStateTransitionError> {
    const moved = this.transition("FAILED");
    if (moved.isFailure) {
      return moved;
    }
    this.props.failureReason = reason;
    this.props.finishedAt = now;
    // An attempt still open when the run dies is abandoned, not lost: a
    // measurement with no outcome would be counted as still running forever.
    const attempt = this.inFlight;
    if (attempt) {
      this.finishAttempt({ outcome: "ABANDONED" }, now);
    }
    this.announceFinish(now);
    return Result.ok(undefined);
  }

  allowedStatusTargets(): readonly RunStatus[] {
    return STATUS_MACHINE.allowedFrom(this.props.status);
  }

  private announceFinish(now: Date): void {
    this.addDomainEvent(
      new RunFinished(
        this.id.value,
        now,
        this.props.workspaceId,
        this.props.taskId,
        this.props.status,
        this.props.failureReason,
      ),
    );
  }

  private transition(next: RunStatus): Result<void, InvalidStateTransitionError> {
    const outcome = STATUS_MACHINE.transition(this.props.status, next);
    switch (outcome.kind) {
      case "alreadyInState":
        return Result.ok(undefined);
      case "invalidTransition":
        return Result.fail(new InvalidStateTransitionError("Run", outcome));
      case "transitioned":
        this.props.status = outcome.to;
        return Result.ok(undefined);
    }
  }
}
