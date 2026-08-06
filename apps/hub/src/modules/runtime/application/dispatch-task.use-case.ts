import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { DomainError } from "../../../kernel/domain/domain-error";
import { GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { branchNameFor } from "../../repository/domain/branch";
import { buildAgentPrompt } from "../domain/agent-prompt";
import {
  WORKER_STORE,
  WorkerStore,
} from "../domain/ports/runtime.repository.port";
import { AGENT_MEMORY, AgentMemory } from "../domain/ports/agent-memory.port";
import {
  DISPATCHABLE_TASK,
  ORGANISING_ACTOR,
  OrganisingActor,
  TASK_ASSIGNEE,
  TaskAssignee,
  DispatchableTask,
  RUN_LEDGER,
  RunLedger,
} from "../domain/ports/dispatch.port";
import { WorkerNotAttachedError, WorkerNotFoundError } from "../domain/runtime.errors";
import { EnqueueCommandUseCase } from "./command.use-cases";

/**
 * §9.9 — no machine attached to this workspace can run what was asked.
 *
 * Named with the capability, because "no worker available" sends an operator
 * looking at machines that are perfectly available and simply cannot do this.
 */
export class NoCapableWorkerError extends DomainError {
  constructor(capability: string, considered: readonly string[]) {
    super(
      considered.length === 0
        ? "No machine is attached to this workspace (§6.3)"
        : `No machine attached here can run "${capability}". Considered: ${considered.join(", ")} (§9.9)`,
    );
  }
}

export class TaskNotDispatchableError extends DomainError {
  constructor(reason: string) {
    super(reason);
  }
}

export interface DispatchTaskInput {
  workspaceId: string;
  taskId: string;
  provider: string;
  /** Chosen by the caller, or selected by capability when absent (§9.9). */
  workerId?: string;
  model?: string;
  /** §18.4 — what this task requires. Resolved at execution, never carried. */
  secretNames?: readonly string[];
  hubUrl: string;
}

export interface DispatchTaskOutput {
  commandId: string;
  runId: string;
  workerId: string;
  /** §4.8 — set when this dispatch continues an earlier attempt. */
  resumedSessionId: string | null;
}

export type DispatchTaskError =
  | GuardViolation
  | TaskNotDispatchableError
  | WorkerNotFoundError
  | WorkerNotAttachedError
  | NoCapableWorkerError;

/**
 * §6.8, §7.1 — the bridge from "this task is assigned" to "this machine is
 * running it".
 *
 * It was the last thing between a system that could do everything except the
 * work and one that does the work. Four things happen together, and the
 * transaction around the request (§14.1) is what makes "together" true:
 *
 * 1. the task's own module confirms it may be dispatched, and says what it is
 * 2. a machine is chosen — named by the caller, or selected by capability
 * 3. a **Run** records that this is attempt N (§4.7, §9.12)
 * 4. an order is enqueued carrying the prompt, the provider, the run and the
 *    names of the secrets the task needs
 *
 * The prompt is built here rather than by the worker, and that is deliberate:
 * §10's protocol is the hub's contract with its agents, and a worker that
 * composed it could be made to compose a different one. The worker receives
 * text and passes it to a CLI; it never decides what an agent is told.
 *
 * The secret VALUES are not in the order — only their names (§18.4). The
 * worker asks for them while holding the claim, and they exist for the length
 * of that one response.
 */
@Injectable()
export class DispatchTaskUseCase
  implements UseCase<DispatchTaskInput, Result<DispatchTaskOutput, DispatchTaskError>>
{
  constructor(
    @Inject(DISPATCHABLE_TASK) private readonly tasks: DispatchableTask,
    @Inject(AGENT_MEMORY) private readonly memory: AgentMemory,
    @Inject(RUN_LEDGER) private readonly runs: RunLedger,
    @Inject(WORKER_STORE) private readonly workers: WorkerStore,
    @Inject(TASK_ASSIGNEE) private readonly assignees: TaskAssignee,
    @Inject(ORGANISING_ACTOR) private readonly organisingActor: OrganisingActor,
    private readonly enqueue: EnqueueCommandUseCase,
  ) {}

  async execute(
    input: DispatchTaskInput,
  ): Promise<Result<DispatchTaskOutput, DispatchTaskError>> {
    const briefing = await this.tasks.briefingFor(input.workspaceId, input.taskId);
    if (!briefing.dispatchable) {
      return Result.fail(new TaskNotDispatchableError(briefing.reason));
    }

    const worker = await this.selectWorker(input);
    if (worker.isFailure) {
      return Result.fail(worker.error);
    }

    /**
     * §4.8 (0.3.11) — a resume only ever uses the provider that produced the
     * attempt. Asked here, before anything is enqueued, so a mismatch is a
     * refusal at the door rather than a malformed context several layers in.
     */
    const previous = await this.runs.latestFor(input.workspaceId, input.taskId);
    const resumedSessionId =
      previous && previous.provider === input.provider ? previous.providerSessionId : null;

    const assignee = await this.assignees.assigneeOf(input.workspaceId, input.taskId);
    const organising = assignee
      ? await this.organisingActor.organises(assignee, input.workspaceId)
      : false;

    const run = await this.runs.openRun(input.workspaceId, input.taskId);

    /**
     * §16 — what this workspace has already settled, handed over with the
     * task. Without it an agent re-litigates last week's convention on every
     * dispatch, and the memory module is a write-only diary.
     */
    const memory = await this.memory.notesFor({
      workspaceId: input.workspaceId,
      goalId: briefing.goalId,
      taskId: input.taskId,
    });

    const enqueued = await this.enqueue.execute({
      workspaceId: input.workspaceId,
      workerId: worker.value,
      type: "ExecuteTask",
      payload: {
        provider: input.provider,
        ...(input.model ? { model: input.model } : {}),
        prompt: buildAgentPrompt({
          workspaceId: input.workspaceId,
          taskId: input.taskId,
          title: briefing.title,
          description: briefing.description,
          acceptanceCriteria: briefing.acceptanceCriteria,
          goalTitle: briefing.goalTitle,
          memory,
          hubUrl: input.hubUrl,
          // §8.3 — an agent that does not know it shares a checkout behaves
          // as though it were alone in it.
          repository: briefing.repository
            ? {
                name: briefing.repository.name,
                branch: branchNameFor({ kind: "TASK", id: input.taskId }),
              }
            : null,
          // §4.6 — a manager is briefed to organise, not to execute. Asked
          // of the same permission the bridge uses to choose its tools, so
          // the prompt cannot name a tool the agent was never given.
          organising,
        }),
        /**
         * §8.3 — where the work happens, when it happens in code.
         *
         * The machine checks it out on a branch of this task's own. The
         * branch is named here rather than on the machine so that the hub's
         * record and the machine's checkout cannot disagree about what it is
         * called — `branchNameFor` is the same function the repository module
         * uses when it opens a branch.
         */
        ...(briefing.repository
          ? {
              repository: {
                id: briefing.repository.id,
                name: briefing.repository.name,
                origin: briefing.repository.origin,
                localPath: briefing.repository.localPath,
                branch: branchNameFor({ kind: "TASK", id: input.taskId }),
                baseBranch: briefing.repository.baseBranch,
                protectedBranches: [...briefing.repository.protectedBranches],
              },
            }
          : {}),
        // Names only. The values never travel in an order (§18.4).
        secretNames: [...(input.secretNames ?? [])],
        runId: run.runId,
        taskId: input.taskId,
        ...(resumedSessionId ? { resumeSessionId: resumedSessionId } : {}),
      },
    });
    if (enqueued.isFailure) {
      return Result.fail(enqueued.error);
    }

    return Result.ok({
      commandId: enqueued.value.commandId,
      runId: run.runId,
      workerId: worker.value,
      resumedSessionId,
    });
  }

  /**
   * §9.9 — a machine is compatible or it is not, and the choice is a written
   * order rather than a score (§10.18d): the caller's machine if they named
   * one, otherwise the first attached machine that declares the capability,
   * by hostname so the same inputs always give the same answer.
   */
  private async selectWorker(
    input: DispatchTaskInput,
  ): Promise<Result<string, DispatchTaskError>> {
    const attached = await this.workers.listForWorkspace(input.workspaceId);

    if (input.workerId) {
      const named = attached.find((worker) => worker.id.value === input.workerId);
      if (!named) {
        // Not attached and not existing answer the same way: §6.10 says a
        // runtime never receives another workspace's work, and confirming a
        // machine exists elsewhere would be answering about it.
        return Result.fail(new WorkerNotFoundError(input.workerId));
      }
      return Result.ok(named.id.value);
    }

    const capable = attached
      .filter((worker) => worker.capabilities.includes(input.provider))
      .sort((left, right) => left.hostname.localeCompare(right.hostname));
    const chosen = capable[0];
    if (!chosen) {
      return Result.fail(
        new NoCapableWorkerError(
          input.provider,
          attached.map((worker) => worker.hostname),
        ),
      );
    }
    return Result.ok(chosen.id.value);
  }
}
