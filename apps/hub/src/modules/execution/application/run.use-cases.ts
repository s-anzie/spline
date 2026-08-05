import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { isStale } from "../../../kernel/domain/staleness";
import { Result } from "../../../kernel/domain/result";
import {
  AttemptAlreadyInFlightError,
  AttemptNotResumableError,
  NoAttemptInFlightError,
  RunNotFoundError,
} from "../domain/execution.errors";
import {
  RETRYABLE_TASK,
  RetryableTask,
  RUN_REPOSITORY,
  RunRepository,
} from "../domain/ports/run.repository.port";
import { AttemptOutcome, Run } from "../domain/run";

export interface StartRunInput {
  workspaceId: string;
  taskId: string;
}

/**
 * §9.12 — "Chaque Retry crée un nouveau Run". This is that creation, whether
 * it is the first execution or the fourth: nothing here distinguishes them,
 * because §9.12 does not either. The attempt number comes from what already
 * exists, so the history reads as a sequence rather than a set.
 */
@Injectable()
export class StartRunUseCase
  implements UseCase<StartRunInput, Result<{ runId: string }, GuardViolation>>
{
  constructor(
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(input: StartRunInput): Promise<Result<{ runId: string }, GuardViolation>> {
    const previous = await this.runs.countForTask(input.taskId);
    const run = Run.start({
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      attemptNumber: previous + 1,
      now: this.clock.now(),
    });
    if (run.isFailure) {
      return Result.fail(run.error);
    }

    await this.runs.save(run.value);
    await flushDomainEvents(run.value, this.publisher);
    return Result.ok({ runId: run.value.id.value });
  }
}

export interface RetryTaskInput {
  workspaceId: string;
  taskId: string;
}

export type RetryTaskError = GuardViolation | TaskNotRetryableError;

/**
 * A task whose state does not allow a retry. Named rather than generic
 * because §20.6 asks a refusal to say what would have worked, and "this task
 * is COMPLETED" is a different problem from "this task does not exist".
 */
export class TaskNotRetryableError extends Error {
  readonly name = "TaskNotRetryableError";

  constructor(reason: string) {
    super(reason);
  }
}

/**
 * §9.12 — the retry itself.
 *
 * Two things happen and both must, or neither: the task reopens, and a new
 * run records that this is attempt N+1. The transaction around every mutating
 * request (§14.1) is what makes "or neither" true — before it, a reopened
 * task with no run was a task nobody could explain.
 *
 * Whether the task MAY reopen is the task module's judgement, asked through a
 * port this module declares. Execution never decides what a task's states
 * mean.
 */
@Injectable()
export class RetryTaskUseCase
  implements UseCase<RetryTaskInput, Result<{ runId: string }, RetryTaskError>>
{
  constructor(
    @Inject(RETRYABLE_TASK) private readonly tasks: RetryableTask,
    private readonly startRun: StartRunUseCase,
  ) {}

  async execute(
    input: RetryTaskInput,
  ): Promise<Result<{ runId: string }, RetryTaskError>> {
    const outcome = await this.tasks.reopenForRetry(input.taskId, input.workspaceId);
    if (!outcome.retryable) {
      return Result.fail(new TaskNotRetryableError(outcome.reason));
    }
    return this.startRun.execute(input);
  }
}

export interface BeginAttemptInput {
  runId: string;
  workspaceId: string;
  workerId: string;
  provider: string;
  model?: string;
  promptVersion?: string;
}

export type BeginAttemptError =
  | RunNotFoundError
  | AttemptAlreadyInFlightError
  | InvalidStateTransitionError;

/** §4.8 — what actually ran, recorded as it starts rather than afterwards. */
@Injectable()
export class BeginAttemptUseCase
  implements UseCase<BeginAttemptInput, Result<{ attemptNumber: number }, BeginAttemptError>>
{
  constructor(
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: BeginAttemptInput,
  ): Promise<Result<{ attemptNumber: number }, BeginAttemptError>> {
    const run = await this.load(input.runId, input.workspaceId);
    if (!run) {
      return Result.fail(new RunNotFoundError(input.runId));
    }

    const attempt = run.beginAttempt(input, this.clock.now());
    if (attempt.isFailure) {
      return Result.fail(attempt.error);
    }

    await this.runs.save(run);
    await flushDomainEvents(run, this.publisher);
    return Result.ok({ attemptNumber: attempt.value.number });
  }

  private async load(runId: string, workspaceId: string): Promise<Run | null> {
    const run = await this.runs.findById(runId);
    // §4.2 — a run of another workspace is not found, not forbidden: saying
    // "forbidden" would confirm it exists.
    return run && run.workspaceId === workspaceId ? run : null;
  }
}

export interface FinishAttemptInput {
  runId: string;
  workspaceId: string;
  outcome: AttemptOutcome;
  tokenUsage?: Record<string, number>;
  cost?: number;
  /** Where the run goes next. Absent leaves it running for another attempt. */
  runStatus?: "VALIDATING" | "FAILED";
  failureReason?: string;
}

export type FinishAttemptError =
  | RunNotFoundError
  | NoAttemptInFlightError
  | InvalidStateTransitionError;

/**
 * §4.8 — closes the measurement, and optionally the run.
 *
 * The two are separate on purpose: a run may hold several attempts, and an
 * attempt that failed does not decide whether the run is over. That is the
 * scheduler's call (§9.12), not the attempt's.
 */
@Injectable()
export class FinishAttemptUseCase
  implements UseCase<FinishAttemptInput, Result<void, FinishAttemptError>>
{
  constructor(
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(input: FinishAttemptInput): Promise<Result<void, FinishAttemptError>> {
    const run = await this.runs.findById(input.runId);
    if (!run || run.workspaceId !== input.workspaceId) {
      return Result.fail(new RunNotFoundError(input.runId));
    }

    const now = this.clock.now();
    const closed = run.finishAttempt(input, now);
    if (closed.isFailure) {
      return Result.fail(closed.error);
    }

    if (input.runStatus === "VALIDATING") {
      const moved = run.toValidating(now);
      if (moved.isFailure) {
        return Result.fail(moved.error);
      }
    } else if (input.runStatus === "FAILED") {
      const moved = run.fail(input.failureReason ?? "the attempt failed", now);
      if (moved.isFailure) {
        return Result.fail(moved.error);
      }
    }

    await this.runs.save(run);
    await flushDomainEvents(run, this.publisher);
    return Result.ok(undefined);
  }
}

export interface ResumeCheckInput {
  runId: string;
  workspaceId: string;
  provider: string;
}

/**
 * §4.8's resume invariant (0.3.11), as a question anyone can ask before
 * acting. Exposed as its own use case because the refusal is more useful
 * BEFORE a session is started than after: by then the context is already
 * malformed and the error names the wrong layer.
 */
@Injectable()
export class CheckResumableUseCase
  implements
    UseCase<ResumeCheckInput, Result<{ provider: string }, RunNotFoundError | AttemptNotResumableError>>
{
  constructor(@Inject(RUN_REPOSITORY) private readonly runs: RunRepository) {}

  async execute(
    input: ResumeCheckInput,
  ): Promise<Result<{ provider: string }, RunNotFoundError | AttemptNotResumableError>> {
    const run = await this.runs.findById(input.runId);
    if (!run || run.workspaceId !== input.workspaceId) {
      return Result.fail(new RunNotFoundError(input.runId));
    }
    const resumable = run.resumableBy(input.provider);
    return resumable.isFailure
      ? Result.fail(resumable.error)
      : Result.ok({ provider: resumable.value.provider });
  }
}

export interface SweepOverrunInput {
  workspaceId: string;
  ttlMs: number;
}

/**
 * §9.13 — "Au dépassement : session arrêtée, Lease expire, tâche passe en
 * échec ou retry."
 *
 * This is the first half: a run that has been executing longer than the
 * workspace allows is failed, and its attempt marked ABANDONED rather than
 * left open forever. What happens to the TASK afterwards is the scheduler's
 * decision (fail or retry), and it hears about it through `run_finished`.
 *
 * Explicit rather than periodic, like every other staleness in this system
 * (§17.7): the deadline is judged at read, so changing the policy changes
 * every answer immediately instead of only future ones.
 */
@Injectable()
export class SweepOverrunRunsUseCase
  implements UseCase<SweepOverrunInput, Result<{ failed: string[] }, never>>
{
  constructor(
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(input: SweepOverrunInput): Promise<Result<{ failed: string[] }, never>> {
    const now = this.clock.now();
    const failed: string[] = [];

    for (const run of await this.runs.listLive(input.workspaceId)) {
      // A run that has not started yet is waiting, not overrunning.
      if (!isStale(run.startedAt, input.ttlMs, now)) {
        continue;
      }
      const outcome = run.fail(
        `this run exceeded the ${input.ttlMs}ms this workspace allows (§9.13)`,
        now,
      );
      if (outcome.isFailure) {
        continue;
      }
      await this.runs.save(run);
      await flushDomainEvents(run, this.publisher);
      failed.push(run.id.value);
    }

    // §17.8 — the names, never a bare count. "Four runs timed out" is not
    // something anyone can act on.
    return Result.ok({ failed });
  }
}
