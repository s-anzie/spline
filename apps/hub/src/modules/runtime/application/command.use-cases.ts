import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { RuntimeCommand } from "../domain/runtime-command";
import {
  COMMAND_STORE,
  CommandStore,
  WORKER_STORE,
  WorkerStore,
} from "../domain/ports/runtime.repository.port";
import {
  CommandAlreadyClaimedError,
  WorkerNotAttachedError,
  WorkerNotFoundError,
} from "../domain/runtime.errors";

export interface EnqueueCommandInput {
  workspaceId: string;
  workerId: string;
  type: string;
  payload?: Record<string, unknown>;
}

export type EnqueueCommandError =
  | GuardViolation
  | WorkerNotFoundError
  | WorkerNotAttachedError;

/** §6.8 — the hub decides and enqueues; the worker pulls and executes. */
@Injectable()
export class EnqueueCommandUseCase
  implements
    UseCase<EnqueueCommandInput, Result<{ commandId: string }, EnqueueCommandError>>
{
  constructor(
    @Inject(COMMAND_STORE) private readonly commands: CommandStore,
    @Inject(WORKER_STORE) private readonly workers: WorkerStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: EnqueueCommandInput,
  ): Promise<Result<{ commandId: string }, EnqueueCommandError>> {
    const worker = await this.workers.findById(input.workerId);
    if (!worker) {
      return Result.fail(new WorkerNotFoundError(input.workerId));
    }
    // §6.10 — an order for a machine that does not serve this workspace would
    // be exactly the "tâche étrangère" a runtime must never receive.
    if (!worker.serves(input.workspaceId)) {
      return Result.fail(
        new WorkerNotAttachedError(worker.hostname, input.workspaceId),
      );
    }

    const command = RuntimeCommand.enqueue({ ...input, now: this.clock.now() });
    if (command.isFailure) {
      return Result.fail(command.error);
    }
    await this.commands.save(command.value);
    await flushDomainEvents(command.value, this.publisher);
    return Result.ok({ commandId: command.value.id.value });
  }
}

export interface ClaimCommandsInput {
  workerId: string;
  max?: number;
}

export interface ClaimedCommand {
  id: string;
  workspaceId: string;
  type: string;
  payload: Record<string, unknown>;
}

/**
 * A worker pulls; the hub never pushes. A worker connects outward — it may sit
 * behind a home router, and §1 wants three machines an operator owns — and an
 * order nobody claimed has to survive a hub restart, which a push would lose.
 */
@Injectable()
export class ClaimCommandsUseCase
  implements UseCase<ClaimCommandsInput, Result<ClaimedCommand[], WorkerNotFoundError>>
{
  constructor(
    @Inject(COMMAND_STORE) private readonly commands: CommandStore,
    @Inject(WORKER_STORE) private readonly workers: WorkerStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: ClaimCommandsInput,
  ): Promise<Result<ClaimedCommand[], WorkerNotFoundError>> {
    const worker = await this.workers.findById(input.workerId);
    if (!worker) {
      return Result.fail(new WorkerNotFoundError(input.workerId));
    }

    const now = this.clock.now();
    // Pulling is also a heartbeat: a worker asking for work is plainly there,
    // and requiring a separate beat would let a busy one look silent.
    worker.heartbeat(now);
    await this.workers.save(worker);

    const claimed: ClaimedCommand[] = [];
    for (const command of await this.commands.listPendingForWorker(
      worker.id.value,
      input.max ?? 10,
    )) {
      const took = command.claim(worker.id.value, now);
      if (took.isFailure) {
        // Another worker got there first. Skipped, never reported as an
        // error: losing a race is the normal outcome of a queue.
        continue;
      }
      await this.commands.save(command);
      await flushDomainEvents(command, this.publisher);
      claimed.push({
        id: command.id.value,
        workspaceId: command.workspaceId,
        type: command.type,
        payload: command.payload,
      });
    }
    return Result.ok(claimed);
  }
}

export interface ReportCommandInput {
  commandId: string;
  workerId: string;
  outcome: "COMPLETED" | "FAILED";
  result?: Record<string, unknown>;
  failureReason?: string;
}

export type ReportCommandError =
  | GuardViolation
  | WorkerNotFoundError
  | CommandAlreadyClaimedError
  | InvalidStateTransitionError;

/** The worker says what happened. Only the holder may. */
@Injectable()
export class ReportCommandUseCase
  implements UseCase<ReportCommandInput, Result<void, ReportCommandError>>
{
  constructor(
    @Inject(COMMAND_STORE) private readonly commands: CommandStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(input: ReportCommandInput): Promise<Result<void, ReportCommandError>> {
    const guarded = Guard.againstEmpty(input.commandId, "commandId");
    if (guarded.isFailure) {
      return Result.fail(guarded.error);
    }
    const command = await this.commands.findById(guarded.value);
    if (!command) {
      return Result.fail(new WorkerNotFoundError(guarded.value));
    }
    // Reporting on somebody else's order would let a machine finish work it
    // never did — the same reason a lock refuses a stranger's release.
    if (command.claimedBy !== input.workerId) {
      return Result.fail(
        new CommandAlreadyClaimedError(command.claimedBy ?? "nobody"),
      );
    }

    const now = this.clock.now();
    const settled =
      input.outcome === "COMPLETED"
        ? command.complete(input.result ?? {}, now)
        : command.fail(input.failureReason ?? "the worker reported a failure", now);
    if (settled.isFailure) {
      return Result.fail(settled.error);
    }

    await this.commands.save(command);
    await flushDomainEvents(command, this.publisher);
    return Result.ok(undefined);
  }
}
