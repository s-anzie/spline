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
import { ActorRef } from "../../identity/domain/actor";
import {
  MissingSecretsError,
  ResolveSecretsUseCase,
} from "../../secret/application/secret.use-cases";
import { RUN_LEDGER, RunLedger, TASK_ASSIGNEE, TaskAssignee } from "../domain/ports/dispatch.port";
import {
  IssueTaskGrantOutput,
  IssueTaskGrantUseCase,
  NoGrantableScopesError,
} from "../../identity/application/task-grant.use-cases";
import {
  CommandAlreadyClaimedError,
  WorkerImpersonationError,
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
  /** §18 — the caller, which must be the machine whose queue this is. */
  actor: ActorRef;
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
  implements
    UseCase<
      ClaimCommandsInput,
      Result<ClaimedCommand[], WorkerNotFoundError | WorkerImpersonationError>
    >
{
  constructor(
    @Inject(COMMAND_STORE) private readonly commands: CommandStore,
    @Inject(WORKER_STORE) private readonly workers: WorkerStore,
    @Inject(RUN_LEDGER) private readonly runs: RunLedger,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: ClaimCommandsInput,
  ): Promise<Result<ClaimedCommand[], WorkerNotFoundError | WorkerImpersonationError>> {
    const worker = await this.workers.findById(input.workerId);
    if (!worker) {
      return Result.fail(new WorkerNotFoundError(input.workerId));
    }
    /**
     * §18 — the id in the path is not a credential. Without this, any
     * authenticated actor could pull the orders addressed to somebody else's
     * machine: it would read their payloads, and the machine they were meant
     * for would find nothing left to claim.
     */
    if (!worker.isOperatedBy(input.actor)) {
      return Result.fail(new WorkerImpersonationError(worker.hostname));
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

      /**
       * §4.7 — the run starts here, because taking the order IS starting.
       * A run left PENDING while a machine executes it would be lying for the
       * whole duration, and the overrun sweep (§9.13) judges against a
       * `startedAt` that only an open attempt sets.
       */
      await this.runs.beginAttempt({
        workspaceId: command.workspaceId,
        runId: typeof command.payload.runId === "string" ? command.payload.runId : null,
        workerId: worker.id.value,
        provider:
          typeof command.payload.provider === "string" ? command.payload.provider : "",
        model: typeof command.payload.model === "string" ? command.payload.model : null,
      });

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
  /** §18 — the caller, which must be the machine that holds the order. */
  actor: ActorRef;
  outcome: "COMPLETED" | "FAILED";
  result?: Record<string, unknown>;
  failureReason?: string;
}

export type ReportCommandError =
  | GuardViolation
  | WorkerNotFoundError
  | WorkerImpersonationError
  | CommandAlreadyClaimedError
  | InvalidStateTransitionError;

/** The worker says what happened. Only the holder may. */
@Injectable()
export class ReportCommandUseCase
  implements UseCase<ReportCommandInput, Result<void, ReportCommandError>>
{
  constructor(
    @Inject(COMMAND_STORE) private readonly commands: CommandStore,
    @Inject(WORKER_STORE) private readonly workers: WorkerStore,
    @Inject(RUN_LEDGER) private readonly runs: RunLedger,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(input: ReportCommandInput): Promise<Result<void, ReportCommandError>> {
    const guarded = Guard.againstEmpty(input.commandId, "commandId");
    if (guarded.isFailure) {
      return Result.fail(guarded.error);
    }
    // Checked before the order is even read: "is the caller this machine?" is
    // a question about the caller, and the answer must not depend on which
    // order they name (§18).
    const worker = await this.workers.findById(input.workerId);
    if (!worker) {
      return Result.fail(new WorkerNotFoundError(input.workerId));
    }
    if (!worker.isOperatedBy(input.actor)) {
      return Result.fail(new WorkerImpersonationError(worker.hostname));
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

    /**
     * §4.8 — the run learns what the attempt cost and, crucially, which
     * provider session it left behind. Without that last part `resumableBy()`
     * can say "yes, same provider" while having nothing to resume.
     *
     * Best-effort on purpose: an order that finished is finished, and a
     * bookkeeping failure must not un-finish it. The order carries the run,
     * so a run that cannot be closed here is still findable.
     */
    await this.runs.recordOutcome({
      workspaceId: command.workspaceId,
      runId: typeof command.payload.runId === "string" ? command.payload.runId : null,
      outcome: input.outcome,
      result: input.result ?? {},
      failureReason: input.failureReason ?? null,
    });

    return Result.ok(undefined);
  }
}

export interface ResolveCommandSecretsInput {
  workerId: string;
  commandId: string;
  actor: ActorRef;
}

export type ResolveCommandSecretsError =
  | WorkerNotFoundError
  | WorkerImpersonationError
  | CommandAlreadyClaimedError
  | MissingSecretsError;

/**
 * §18.4 — hands a worker the secrets its order declared, and only those.
 *
 * Three conditions, and each closes something specific:
 *
 * 1. **The caller is the machine.** Same check as every other machine route
 *    (§18.10): an id in a path is not a credential.
 * 2. **The machine HOLDS this order.** A worker that could ask about an order
 *    it never claimed could ask about every order, and read every secret any
 *    of them declared.
 * 3. **The names come from the ORDER**, never from the request. A worker that
 *    named its own secrets would be choosing what to receive, which is the
 *    opposite of "uniquement les secrets nécessaires à la tâche".
 */
@Injectable()
export class ResolveCommandSecretsUseCase
  implements
    UseCase<
      ResolveCommandSecretsInput,
      Result<Record<string, string>, ResolveCommandSecretsError>
    >
{
  constructor(
    @Inject(COMMAND_STORE) private readonly commands: CommandStore,
    @Inject(WORKER_STORE) private readonly workers: WorkerStore,
    private readonly resolveSecrets: ResolveSecretsUseCase,
  ) {}

  async execute(
    input: ResolveCommandSecretsInput,
  ): Promise<Result<Record<string, string>, ResolveCommandSecretsError>> {
    const worker = await this.workers.findById(input.workerId);
    if (!worker) {
      return Result.fail(new WorkerNotFoundError(input.workerId));
    }
    if (!worker.isOperatedBy(input.actor)) {
      return Result.fail(new WorkerImpersonationError(worker.hostname));
    }

    const command = await this.commands.findById(input.commandId);
    if (!command) {
      return Result.fail(new WorkerNotFoundError(input.commandId));
    }
    // Holding the order is what entitles a machine to its credentials.
    if (command.claimedBy !== input.workerId) {
      return Result.fail(
        new CommandAlreadyClaimedError(command.claimedBy ?? "nobody"),
      );
    }

    const declared = command.payload.secretNames;
    const names = Array.isArray(declared)
      ? declared.filter((name): name is string => typeof name === "string")
      : [];

    return this.resolveSecrets.execute({
      workspaceId: command.workspaceId,
      names,
      actor: input.actor,
      reason: `command ${command.type} (${command.id.value})`,
    });
  }
}

export interface ResolveCommandGrantInput {
  workerId: string;
  commandId: string;
  actor: ActorRef;
  ttlMs: number;
}

export type ResolveCommandGrantError =
  | WorkerNotFoundError
  | WorkerImpersonationError
  | CommandAlreadyClaimedError
  | GuardViolation
  | NoGrantableScopesError;

/**
 * §18.10, §10 — mints the credential an agent uses to call back mid-task.
 *
 * The same three conditions as the secrets route, for the same reasons: the
 * caller is the machine, the machine HOLDS this order, and what is granted
 * comes from the ORDER rather than from the request.
 *
 * The agent it acts as is the TASK'S ASSIGNEE, read from the order — never
 * named by the worker. A machine that could choose whose authority it borrows
 * is a machine that can borrow anyone's, and every entry in the journal would
 * then be attributable to whoever the machine felt like naming (§18.10).
 */
@Injectable()
export class ResolveCommandGrantUseCase
  implements
    UseCase<
      ResolveCommandGrantInput,
      Result<IssueTaskGrantOutput, ResolveCommandGrantError>
    >
{
  constructor(
    @Inject(COMMAND_STORE) private readonly commands: CommandStore,
    @Inject(WORKER_STORE) private readonly workers: WorkerStore,
    @Inject(TASK_ASSIGNEE) private readonly tasks: TaskAssignee,
    private readonly issueGrant: IssueTaskGrantUseCase,
  ) {}

  async execute(
    input: ResolveCommandGrantInput,
  ): Promise<Result<IssueTaskGrantOutput, ResolveCommandGrantError>> {
    const worker = await this.workers.findById(input.workerId);
    if (!worker) {
      return Result.fail(new WorkerNotFoundError(input.workerId));
    }
    if (!worker.isOperatedBy(input.actor)) {
      return Result.fail(new WorkerImpersonationError(worker.hostname));
    }

    const command = await this.commands.findById(input.commandId);
    if (!command) {
      return Result.fail(new WorkerNotFoundError(input.commandId));
    }
    if (command.claimedBy !== input.workerId) {
      return Result.fail(
        new CommandAlreadyClaimedError(command.claimedBy ?? "nobody"),
      );
    }

    const taskId =
      typeof command.payload.taskId === "string" ? command.payload.taskId : null;
    if (!taskId) {
      return Result.fail(
        new GuardViolation(
          "taskId",
          "this order belongs to no task, so there is no agent to act as (§10)",
        ),
      );
    }

    const assignee = await this.tasks.assigneeOf(command.workspaceId, taskId);
    if (!assignee) {
      return Result.fail(
        new GuardViolation("taskId", `Task "${taskId}" was not found`),
      );
    }

    return this.issueGrant.execute({
      workspaceId: command.workspaceId,
      taskId,
      actor: assignee,
      ttlMs: input.ttlMs,
    });
  }
}
