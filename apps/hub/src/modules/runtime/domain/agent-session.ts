import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { isStale } from "../../../kernel/domain/staleness";
import { StateMachine } from "../../../kernel/domain/state-machine";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";

/** §4.12 */
export const SESSION_STATUSES = [
  "STARTING",
  "IDLE",
  "RUNNING",
  "WAITING",
  "STOPPED",
  "CRASHED",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/**
 * §4.12's transition invariant (0.3.4) is exactly what `StateMachine` was
 * built for: a transition already satisfied returns `alreadyInState`, one
 * from a terminal state returns `invalidTransition` with `fromTerminal` — a
 * typed outcome, never an unhandled exception (§22.6).
 */
const STATUS_MACHINE = new StateMachine<SessionStatus>({
  STARTING: ["IDLE", "RUNNING", "STOPPED", "CRASHED"],
  IDLE: ["RUNNING", "STOPPED", "CRASHED"],
  RUNNING: ["WAITING", "IDLE", "STOPPED", "CRASHED"],
  WAITING: ["RUNNING", "STOPPED", "CRASHED"],
  STOPPED: [],
  CRASHED: [],
});

export class SessionStarted extends BaseDomainEvent {
  readonly eventName = "runtime.session_started";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly agent: ActorRef,
    readonly provider: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class SessionEnded extends BaseDomainEvent {
  readonly eventName = "runtime.session_ended";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly status: SessionStatus,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

/** §17.9 lists "Runtime Crash" among the alerts. */
export class SessionCrashed extends BaseDomainEvent {
  readonly eventName = "runtime.session_crashed";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly agent: ActorRef,
    readonly reason: string,
    /**
     * The task this session was executing, if any. Carried on the fact
     * because §6.6 requires the task to be put back, and whoever does that
     * has no other way to know which task it was — a listener reading the
     * session afterwards would be reading state that has already moved on.
     */
    readonly taskId: string | null,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

interface SessionProps {
  workspaceId: string;
  agent: ActorRef;
  workerId: string;
  provider: string;
  model: string | null;
  taskId: string | null;
  status: SessionStatus;
  lastHeartbeatAt: Date | null;
  startedAt: Date;
  endedAt: Date | null;
  endReason: string | null;
}

export interface StartSessionProps {
  workspaceId: string;
  agent: ActorRef;
  workerId: string;
  provider: string;
  model?: string;
  taskId?: string;
  now: Date;
}

/**
 * §4.12 — "une session est éphémère. L'Agent est permanent." The session is
 * the living instance; the agent is the actor that outlives it.
 */
export class AgentSession extends AggregateRoot<SessionProps> {
  static start(
    input: StartSessionProps,
    id?: UniqueEntityId,
  ): Result<AgentSession, GuardViolation> {
    for (const [value, name] of [
      [input.workspaceId, "workspaceId"],
      [input.workerId, "workerId"],
      [input.provider, "provider"],
    ] as const) {
      const guarded = Guard.againstEmpty(value, name);
      if (guarded.isFailure) {
        return Result.fail(guarded.error);
      }
    }

    const session = new AgentSession(
      {
        workspaceId: input.workspaceId,
        agent: input.agent,
        workerId: input.workerId,
        provider: input.provider,
        model: input.model ?? null,
        taskId: input.taskId ?? null,
        status: "STARTING",
        lastHeartbeatAt: input.now,
        startedAt: input.now,
        endedAt: null,
        endReason: null,
      },
      id,
    );
    session.addDomainEvent(
      new SessionStarted(
        session.id.value,
        input.now,
        input.workspaceId,
        input.agent,
        input.provider,
      ),
    );
    return Result.ok(session);
  }

  static reconstitute(props: SessionProps, id: string): AgentSession {
    return new AgentSession(props, new UniqueEntityId(id));
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get agent(): ActorRef {
    return this.props.agent;
  }

  get workerId(): string {
    return this.props.workerId;
  }

  get provider(): string {
    return this.props.provider;
  }

  get model(): string | null {
    return this.props.model;
  }

  get taskId(): string | null {
    return this.props.taskId;
  }

  get status(): SessionStatus {
    return this.props.status;
  }

  get lastHeartbeatAt(): Date | null {
    return this.props.lastHeartbeatAt;
  }

  get startedAt(): Date {
    return this.props.startedAt;
  }

  get endedAt(): Date | null {
    return this.props.endedAt;
  }

  get endReason(): string | null {
    return this.props.endReason;
  }

  get isLive(): boolean {
    return this.props.status !== "STOPPED" && this.props.status !== "CRASHED";
  }

  /** §17.7 — judged at read, like a worker's and a lock's. */
  isStaleAt(now: Date, ttlMs: number): boolean {
    return this.isLive && isStale(this.props.lastHeartbeatAt, ttlMs, now);
  }

  heartbeat(now: Date): void {
    if (this.isLive) {
      this.props.lastHeartbeatAt = now;
    }
  }

  /**
   * §4.12's invariant, verbatim: already in the target state is a success
   * with nothing done, and a terminal state gives a typed refusal — never an
   * unhandled exception (0.3.4).
   */
  changeStatus(
    next: SessionStatus,
    now: Date,
    reason?: string,
  ): Result<void, InvalidStateTransitionError> {
    const outcome = STATUS_MACHINE.transition(this.props.status, next);
    switch (outcome.kind) {
      case "alreadyInState":
        return Result.ok(undefined);
      case "invalidTransition":
        return Result.fail(new InvalidStateTransitionError("AgentSession", outcome));
      case "transitioned": {
        this.props.status = outcome.to;
        if (outcome.to === "STOPPED" || outcome.to === "CRASHED") {
          this.props.endedAt = now;
          this.props.endReason = reason ?? null;
          this.addDomainEvent(
            outcome.to === "CRASHED"
              ? new SessionCrashed(
                  this.id.value,
                  now,
                  this.props.workspaceId,
                  this.props.agent,
                  reason ?? "the session stopped reporting",
                  this.props.taskId,
                )
              : new SessionEnded(
                  this.id.value,
                  now,
                  this.props.workspaceId,
                  outcome.to,
                ),
          );
        }
        return Result.ok(undefined);
      }
    }
  }

  allowedStatusTargets(): readonly SessionStatus[] {
    return STATUS_MACHINE.allowedFrom(this.props.status);
  }
}
