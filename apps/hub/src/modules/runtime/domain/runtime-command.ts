import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { isStale } from "../../../kernel/domain/staleness";
import { StateMachine } from "../../../kernel/domain/state-machine";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { CommandAlreadyClaimedError } from "./runtime.errors";

export const COMMAND_STATUSES = [
  "PENDING",
  "CLAIMED",
  "COMPLETED",
  "FAILED",
] as const;
export type CommandStatus = (typeof COMMAND_STATUSES)[number];

/**
 * §6.8 lists the orders. Free string rather than an enum, like a validation
 * type: the Repository Engine adds `CreateWorktree`, an Extension will add
 * its own (§19.3), and an enum would make every new Tool a change here.
 */
export const CORE_COMMAND_TYPES = [
  "ExecuteTask",
  "CancelTask",
  "StartSession",
  "StopSession",
  "CreateWorktree",
  "DeleteWorktree",
  "KillProcess",
] as const;

const STATUS_MACHINE = new StateMachine<CommandStatus>({
  PENDING: ["CLAIMED", "FAILED"],
  // Back to PENDING on purpose: a worker that claimed an order and died must
  // not take it to the grave (§6.6, "aucune tâche ne doit disparaître").
  CLAIMED: ["COMPLETED", "FAILED", "PENDING"],
  COMPLETED: [],
  FAILED: [],
});

export class CommandEnqueued extends BaseDomainEvent {
  readonly eventName = "runtime.command_enqueued";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly workerId: string,
    readonly type: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class CommandFinished extends BaseDomainEvent {
  readonly eventName = "runtime.command_finished";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly type: string,
    readonly status: CommandStatus,
    readonly failureReason: string | null,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

interface CommandProps {
  workspaceId: string;
  workerId: string;
  type: string;
  payload: Record<string, unknown>;
  status: CommandStatus;
  claimedBy: string | null;
  claimedAt: Date | null;
  finishedAt: Date | null;
  result: Record<string, unknown> | null;
  failureReason: string | null;
  createdAt: Date;
}

export interface EnqueueCommandProps {
  workspaceId: string;
  workerId: string;
  type: string;
  payload?: Record<string, unknown>;
  now: Date;
}

/**
 * §6.8 — an order addressed TO a worker.
 *
 * A queue rather than a push, for two reasons that are both about reality:
 * a worker connects outward (it may sit behind a home router, and §1 wants
 * three machines an operator owns), and an order nobody has claimed must
 * survive a hub restart. A push would need the hub to reach in, and would
 * lose whatever was in flight.
 */
export class RuntimeCommand extends AggregateRoot<CommandProps> {
  static enqueue(
    input: EnqueueCommandProps,
    id?: UniqueEntityId,
  ): Result<RuntimeCommand, GuardViolation> {
    for (const [value, name] of [
      [input.workspaceId, "workspaceId"],
      [input.workerId, "workerId"],
      [input.type, "type"],
    ] as const) {
      const guarded = Guard.againstEmpty(value, name);
      if (guarded.isFailure) {
        return Result.fail(guarded.error);
      }
    }

    const command = new RuntimeCommand(
      {
        workspaceId: input.workspaceId,
        workerId: input.workerId,
        type: input.type.trim(),
        payload: input.payload ?? {},
        status: "PENDING",
        claimedBy: null,
        claimedAt: null,
        finishedAt: null,
        result: null,
        failureReason: null,
        createdAt: input.now,
      },
      id,
    );
    command.addDomainEvent(
      new CommandEnqueued(
        command.id.value,
        input.now,
        input.workspaceId,
        input.workerId,
        command.type,
      ),
    );
    return Result.ok(command);
  }

  static reconstitute(props: CommandProps, id: string): RuntimeCommand {
    return new RuntimeCommand(props, new UniqueEntityId(id));
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get workerId(): string {
    return this.props.workerId;
  }

  get type(): string {
    return this.props.type;
  }

  get payload(): Record<string, unknown> {
    return this.props.payload;
  }

  get status(): CommandStatus {
    return this.props.status;
  }

  get claimedBy(): string | null {
    return this.props.claimedBy;
  }

  get claimedAt(): Date | null {
    return this.props.claimedAt;
  }

  get finishedAt(): Date | null {
    return this.props.finishedAt;
  }

  get result(): Record<string, unknown> | null {
    return this.props.result;
  }

  get failureReason(): string | null {
    return this.props.failureReason;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get isPending(): boolean {
    return this.props.status === "PENDING";
  }

  /**
   * §17.7's third monitored resource, and the one 0.3.3 was about: "21
   * commandes runtime bloquées" is a claimed order whose worker never came
   * back. Judged at read, like every other staleness in the system.
   */
  isStuckAt(now: Date, ttlMs: number): boolean {
    return this.props.status === "CLAIMED" && isStale(this.props.claimedAt, ttlMs, now);
  }

  /**
   * The two paths of §13.7, which turn out to apply to a queue exactly as
   * they do to a lock: re-claiming what you already hold is idempotent, and
   * a DIFFERENT worker claiming is a conflict.
   *
   * Found by a test: `alreadyInState` reported success, and the fields were
   * written anyway — so a second worker took an order the first was already
   * executing. Two workers running the same order is the one thing a queue
   * exists to prevent.
   */
  claim(
    workerId: string,
    now: Date,
  ): Result<void, InvalidStateTransitionError | CommandAlreadyClaimedError> {
    if (this.props.status === "CLAIMED") {
      return this.props.claimedBy === workerId
        ? Result.ok(undefined)
        : Result.fail(
            new CommandAlreadyClaimedError(this.props.claimedBy ?? "another worker"),
          );
    }
    const moved = this.transition("CLAIMED", now);
    if (moved.isFailure) {
      return moved;
    }
    this.props.claimedBy = workerId;
    this.props.claimedAt = now;
    return Result.ok(undefined);
  }

  /**
   * A claimed order whose worker vanished goes back to the queue rather than
   * being lost with it (§6.6). Idempotent-friendly: releasing something that
   * is no longer claimed is refused with a typed outcome, not an exception.
   */
  release(now: Date): Result<void, InvalidStateTransitionError> {
    const moved = this.transition("PENDING", now);
    if (moved.isFailure) {
      return moved;
    }
    this.props.claimedBy = null;
    this.props.claimedAt = null;
    return Result.ok(undefined);
  }

  complete(
    result: Record<string, unknown>,
    now: Date,
  ): Result<void, InvalidStateTransitionError> {
    const moved = this.transition("COMPLETED", now);
    if (moved.isFailure) {
      return moved;
    }
    this.props.result = result;
    this.props.finishedAt = now;
    this.announceFinish(now);
    return Result.ok(undefined);
  }

  fail(reason: string, now: Date): Result<void, InvalidStateTransitionError> {
    const moved = this.transition("FAILED", now);
    if (moved.isFailure) {
      return moved;
    }
    this.props.failureReason = reason;
    this.props.finishedAt = now;
    this.announceFinish(now);
    return Result.ok(undefined);
  }

  allowedStatusTargets(): readonly CommandStatus[] {
    return STATUS_MACHINE.allowedFrom(this.props.status);
  }

  private announceFinish(now: Date): void {
    this.addDomainEvent(
      new CommandFinished(
        this.id.value,
        now,
        this.props.workspaceId,
        this.props.type,
        this.props.status,
        this.props.failureReason,
      ),
    );
  }

  private transition(
    next: CommandStatus,
    now: Date,
  ): Result<void, InvalidStateTransitionError> {
    void now;
    const outcome = STATUS_MACHINE.transition(this.props.status, next);
    switch (outcome.kind) {
      case "alreadyInState":
        return Result.ok(undefined);
      case "invalidTransition":
        return Result.fail(new InvalidStateTransitionError("RuntimeCommand", outcome));
      case "transitioned":
        this.props.status = outcome.to;
        return Result.ok(undefined);
    }
  }
}
