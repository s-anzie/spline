import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { WORK_INTAKE, WorkIntake } from "../domain/ports/work-intake.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import {
  NotAParticipantError,
  ThreadClosedError,
  ThreadNotFoundError,
  TurnBudgetExhaustedError,
} from "../domain/conversation.errors";
import {
  THREAD_REPOSITORY,
  ThreadRepository,
} from "../domain/ports/thread.repository.port";
import { Thread } from "../domain/thread";

export interface OpenThreadInput {
  workspaceId: string;
  initiator: ActorRef;
  participantType: ActorType;
  participantId: string;
  subject: string;
  /** §10.18a — set when this thread delegates work and awaits its answer. */
  taskId?: string;
  /**
   * §4.5 — hand the subject over as WORK rather than as a question.
   *
   * The participant must be able to organise, and the need becomes a task
   * they hold. The thread then carries that task, which is what gets the
   * asker told when it ends — the same machinery a delegation already uses.
   */
  handOver?: boolean;
  /** §8.3 — the project the need is about, carried into the work it becomes. */
  repositoryId?: string;
  turnBudget?: number;
}

/**
 * §10.18a — "sessions_spawn" in OpenClaw's vocabulary: delegate, and get told
 * what came of it.
 *
 * Spline had assignment, which is neither delegation nor a question: nobody
 * waits, and nothing links the result to whoever needed it. A thread with a
 * `taskId` is that link.
 */
@Injectable()
export class OpenThreadUseCase
  implements
    UseCase<OpenThreadInput, Result<{ threadId: string; taskId?: string }, GuardViolation>>
{
  constructor(
    @Inject(THREAD_REPOSITORY) private readonly threads: ThreadRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(WORK_INTAKE) private readonly intake: WorkIntake,
  ) {}

  async execute(
    input: OpenThreadInput,
  ): Promise<Result<{ threadId: string; taskId?: string }, GuardViolation>> {
    const participant = ActorRef.create(input.participantType, input.participantId);
    if (participant.isFailure) {
      return Result.fail(participant.error);
    }
    // Talking to oneself is not a conversation, and a turn budget would never
    // stop it.
    if (participant.value.equals(input.initiator)) {
      return Result.fail(
        new GuardViolation("participant", "a thread needs two different actors"),
      );
    }

    /**
     * The work is made BEFORE the thread, and that order matters: a thread
     * that promised to carry a task which then failed to exist would tell the
     * asker their need was taken when nothing holds it. Refusing first costs
     * a request; the other way round costs a silence nobody notices.
     */
    let handedOver: string | null = null;
    if (input.handOver) {
      const opened = await this.intake.openRequest({
        workspaceId: input.workspaceId,
        need: input.subject,
        manager: participant.value,
        asker: input.initiator,
        ...(input.repositoryId ? { repositoryId: input.repositoryId } : {}),
      });
      if (opened.isFailure) {
        return Result.fail(opened.error as GuardViolation);
      }
      handedOver = opened.value.taskId;
    }

    const thread = Thread.open({
      workspaceId: input.workspaceId,
      initiator: input.initiator,
      participant: participant.value,
      subject: input.subject,
      taskId: handedOver ?? input.taskId ?? null,
      turnBudget: input.turnBudget,
      now: this.clock.now(),
    });
    if (thread.isFailure) {
      return Result.fail(thread.error);
    }

    await this.threads.save(thread.value);
    await flushDomainEvents(thread.value, this.publisher);
    return Result.ok({
      threadId: thread.value.id.value,
      ...(handedOver ? { taskId: handedOver } : {}),
    });
  }
}

export interface SpeakInput {
  workspaceId: string;
  threadId: string;
  actor: ActorRef;
  /** Absent means "I have nothing to add" — §10.18b's explicit terminator. */
  message?: string;
}

export type SpeakError =
  | ThreadNotFoundError
  | NotAParticipantError
  | ThreadClosedError
  | TurnBudgetExhaustedError
  | GuardViolation;

/**
 * §10.18b — one turn, or the token that ends the exchange.
 *
 * Both live in one use case because they are the same decision from the
 * speaker's side: "here is my answer" and "I have nothing to add" are the two
 * things a participant can say, and splitting them into two routes would let
 * a client implement only the first — which is how a conversation loses its
 * ability to stop.
 */
@Injectable()
export class SpeakInThreadUseCase
  implements UseCase<SpeakInput, Result<{ status: string; turnsLeft: number }, SpeakError>>
{
  constructor(
    @Inject(THREAD_REPOSITORY) private readonly threads: ThreadRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: SpeakInput,
  ): Promise<Result<{ status: string; turnsLeft: number }, SpeakError>> {
    const thread = await this.threads.findById(input.threadId);
    // §4.2 — a thread of another workspace is not found, never forbidden.
    if (!thread || thread.workspaceId !== input.workspaceId) {
      return Result.fail(new ThreadNotFoundError(input.threadId));
    }

    const now = this.clock.now();
    const spoken =
      input.message === undefined
        ? thread.concede(input.actor, now)
        : thread.reply(input.actor, input.message, now);

    /**
     * A budget that ran out CHANGED the thread — it is exhausted now — so the
     * save happens either way. Returning the refusal without persisting would
     * leave a thread that refuses forever while still claiming to be open.
     */
    await this.threads.save(thread);
    await flushDomainEvents(thread, this.publisher);

    if (spoken.isFailure) {
      return Result.fail(spoken.error);
    }
    return Result.ok({ status: thread.status, turnsLeft: thread.turnsLeft });
  }
}

export interface DeliverInput {
  workspaceId: string;
  threadId: string;
  actor: ActorRef;
  outcome: Record<string, unknown>;
}

export type DeliverError =
  | ThreadNotFoundError
  | NotAParticipantError
  | ThreadClosedError;

/** §10.18a — the answer, travelling back to whoever asked for it. */
@Injectable()
export class DeliverOutcomeUseCase
  implements UseCase<DeliverInput, Result<void, DeliverError>>
{
  constructor(
    @Inject(THREAD_REPOSITORY) private readonly threads: ThreadRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(input: DeliverInput): Promise<Result<void, DeliverError>> {
    const thread = await this.threads.findById(input.threadId);
    if (!thread || thread.workspaceId !== input.workspaceId) {
      return Result.fail(new ThreadNotFoundError(input.threadId));
    }

    const delivered = thread.deliver(input.actor, input.outcome, this.clock.now());
    if (delivered.isFailure) {
      return Result.fail(delivered.error);
    }

    await this.threads.save(thread);
    await flushDomainEvents(thread, this.publisher);
    return Result.ok(undefined);
  }
}
