import { randomUUID } from "node:crypto";

import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { StateMachine } from "../../../kernel/domain/state-machine";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";
import {
  NotAParticipantError,
  ThreadClosedError,
  TurnBudgetExhaustedError,
} from "./conversation.errors";

export const THREAD_STATUSES = ["OPEN", "ANSWERED", "CLOSED", "EXHAUSTED"] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

/**
 * §10.18b — OpenClaw caps agent-to-agent exchanges at five turns
 * (`maxPingPongTurns`, 0–5). The same ceiling, for the same reason: past a
 * handful of turns, two agents are not converging, they are looping.
 */
export const MAX_TURN_BUDGET = 5;

export interface Turn {
  id: string;
  actor: ActorRef;
  /**
   * §10.12 asks for structured events rather than free text. A turn carries
   * a message because a conversation IS text; what it must never carry is an
   * instruction, which is why nothing downstream ever reads this field to
   * decide anything (§18.12).
   */
  message: string;
  at: Date;
}

const STATUS_MACHINE = new StateMachine<ThreadStatus>({
  OPEN: ["ANSWERED", "CLOSED", "EXHAUSTED"],
  ANSWERED: [],
  CLOSED: [],
  EXHAUSTED: [],
});

export class ThreadOpened extends BaseDomainEvent {
  readonly eventName = "conversation.thread_opened";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly initiator: ActorRef,
    readonly participant: ActorRef,
    readonly taskId: string | null,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class ThreadEnded extends BaseDomainEvent {
  readonly eventName = "conversation.thread_ended";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly status: ThreadStatus,
    readonly initiator: ActorRef,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

interface ThreadProps {
  workspaceId: string;
  initiator: ActorRef;
  participant: ActorRef;
  subject: string;
  /** §10.18a — the task this thread delegated, if it delegated one. */
  taskId: string | null;
  turnBudget: number;
  turns: Turn[];
  status: ThreadStatus;
  outcome: Record<string, unknown> | null;
  createdAt: Date;
  endedAt: Date | null;
}

export interface OpenThreadProps {
  workspaceId: string;
  initiator: ActorRef;
  participant: ActorRef;
  subject: string;
  taskId?: string | null;
  turnBudget?: number;
  now: Date;
}

/**
 * §10.18a and §10.18b — a bounded exchange between exactly two actors.
 *
 * Three things Spline did not have, all of which OpenClaw's study named:
 *
 * 1. **Delegation with a return path.** Assigning a task tells somebody to do
 *    something; nobody waits, and nothing links what came back to who asked.
 *    A thread that carries a `taskId` is that link, and `deliver` is the
 *    announcement back.
 * 2. **A bound.** Two actors answering each other, each in a separate
 *    request, loop forever. `ReactionDepth` bounds the technical cascade and
 *    cannot see this at all — each turn is its own call, with its own stack.
 * 3. **A way to stop politely.** Without an explicit "I have nothing to add",
 *    a finished conversation and a truncated one are the same event, and
 *    nobody can tell which happened.
 *
 * Exactly two participants, deliberately. It is also the hook §10.18c said
 * had to exist before "who may speak to whom" could be a policy at all: a
 * thread names its two sides, so refusing to open one is somewhere a rule can
 * live. No permissive port is added in advance — one that always said yes was
 * removed from this codebase once already, and it proved nothing.
 */
export class Thread extends AggregateRoot<ThreadProps> {
  static open(
    input: OpenThreadProps,
    id?: UniqueEntityId,
  ): Result<Thread, GuardViolation> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    const subject = Guard.againstEmpty(input.subject, "subject");
    if (subject.isFailure) {
      return Result.fail(subject.error);
    }

    const turnBudget = input.turnBudget ?? MAX_TURN_BUDGET;
    if (!Number.isInteger(turnBudget) || turnBudget < 1 || turnBudget > MAX_TURN_BUDGET) {
      return Result.fail(
        new GuardViolation(
          "turnBudget",
          `must be between 1 and ${MAX_TURN_BUDGET} — a conversation without a ceiling is a loop (§10.18b)`,
        ),
      );
    }

    const thread = new Thread(
      {
        workspaceId: workspaceId.value,
        initiator: input.initiator,
        participant: input.participant,
        subject: subject.value,
        taskId: input.taskId ?? null,
        turnBudget,
        // Asking IS a turn. Counting it separately would let a budget of one
        // mean "you may ask, and they may answer", which is two.
        turns: [
          {
            id: randomUUID(),
            actor: input.initiator,
            message: subject.value,
            at: input.now,
          },
        ],
        status: "OPEN",
        outcome: null,
        createdAt: input.now,
        endedAt: null,
      },
      id,
    );
    thread.addDomainEvent(
      new ThreadOpened(
        thread.id.value,
        input.now,
        workspaceId.value,
        input.initiator,
        input.participant,
        thread.taskId,
      ),
    );
    return Result.ok(thread);
  }

  static reconstitute(props: ThreadProps, id: string): Thread {
    return new Thread(props, new UniqueEntityId(id));
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get initiator(): ActorRef {
    return this.props.initiator;
  }

  get participant(): ActorRef {
    return this.props.participant;
  }

  get subject(): string {
    return this.props.subject;
  }

  get taskId(): string | null {
    return this.props.taskId;
  }

  get turnBudget(): number {
    return this.props.turnBudget;
  }

  get turns(): readonly Turn[] {
    return [...this.props.turns];
  }

  get turnsLeft(): number {
    return Math.max(0, this.props.turnBudget - this.props.turns.length);
  }

  get status(): ThreadStatus {
    return this.props.status;
  }

  get outcome(): Record<string, unknown> | null {
    return this.props.outcome;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get endedAt(): Date | null {
    return this.props.endedAt;
  }

  /** §10.18a — a delegation that has not yet had its answer. */
  get isAwaiting(): boolean {
    return this.props.taskId !== null && this.props.status === "OPEN";
  }

  private involves(actor: ActorRef): boolean {
    return (
      this.props.initiator.equals(actor) || this.props.participant.equals(actor)
    );
  }

  reply(
    actor: ActorRef,
    message: string,
    now: Date,
  ): Result<Turn, NotAParticipantError | ThreadClosedError | TurnBudgetExhaustedError | GuardViolation> {
    const guarded = this.guardSpeaker(actor);
    if (guarded.isFailure) {
      return Result.fail(guarded.error);
    }
    const text = Guard.againstEmpty(message, "message");
    if (text.isFailure) {
      return Result.fail(text.error);
    }
    /**
     * Checked BEFORE the turn is added, and the thread ends on the attempt
     * that would have overrun. Ending on the turn AFTER would mean the budget
     * was already exceeded by the time anyone noticed.
     */
    if (this.turnsLeft === 0) {
      this.end("EXHAUSTED", now);
      return Result.fail(new TurnBudgetExhaustedError(this.props.turnBudget));
    }

    const turn: Turn = { id: randomUUID(), actor, message: text.value, at: now };
    this.props.turns.push(turn);
    if (this.turnsLeft === 0) {
      this.end("EXHAUSTED", now);
    }
    return Result.ok(turn);
  }

  /** §10.18b — "I have nothing to add", the token OpenClaw calls REPLY_SKIP. */
  concede(
    actor: ActorRef,
    now: Date,
  ): Result<void, NotAParticipantError | ThreadClosedError> {
    const guarded = this.guardSpeaker(actor);
    if (guarded.isFailure) {
      return Result.fail(guarded.error);
    }
    this.end("CLOSED", now);
    return Result.ok(undefined);
  }

  /** §10.18a — the result travels back to whoever asked. */
  deliver(
    actor: ActorRef,
    outcome: Record<string, unknown>,
    now: Date,
  ): Result<void, NotAParticipantError | ThreadClosedError> {
    const guarded = this.guardSpeaker(actor);
    if (guarded.isFailure) {
      return Result.fail(guarded.error);
    }
    if (this.props.taskId === null) {
      return Result.fail(
        new ThreadClosedError("this thread delegated nothing, so it awaits no answer"),
      );
    }
    this.props.outcome = outcome;
    this.end("ANSWERED", now);
    return Result.ok(undefined);
  }

  allowedStatusTargets(): readonly ThreadStatus[] {
    return STATUS_MACHINE.allowedFrom(this.props.status);
  }

  private guardSpeaker(
    actor: ActorRef,
  ): Result<void, NotAParticipantError | ThreadClosedError> {
    if (!this.involves(actor)) {
      return Result.fail(new NotAParticipantError(actor.actorId));
    }
    if (this.props.status !== "OPEN") {
      return Result.fail(
        new ThreadClosedError(`this thread is ${this.props.status.toLowerCase()}`),
      );
    }
    return Result.ok(undefined);
  }

  private end(status: ThreadStatus, now: Date): void {
    const moved = STATUS_MACHINE.transition(this.props.status, status);
    if (moved.kind !== "transitioned") {
      return;
    }
    this.props.status = moved.to;
    this.props.endedAt = now;
    this.addDomainEvent(
      new ThreadEnded(
        this.id.value,
        now,
        this.props.workspaceId,
        moved.to,
        this.props.initiator,
      ),
    );
  }
}
