import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { DomainError } from "../../../kernel/domain/domain-error";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { branchNameFor } from "../../repository/domain/branch";
import { buildAgentPrompt } from "../domain/agent-prompt";
import { AgentSession } from "../domain/agent-session";
import {
  SESSION_STORE,
  SessionStore,
  WORKER_STORE,
  WorkerStore,
} from "../domain/ports/runtime.repository.port";
import { AGENT_MEMORY, AgentMemory } from "../domain/ports/agent-memory.port";
import {
  DISPATCHABLE_TASK,
  ORGANISING_ACTOR,
  OrganisingActor,
  AUTOMATION_POLICY,
  AutomationPolicy,
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

/**
 * §4.12 — this agent already has as many instances as it may have.
 *
 * A conflict rather than a refusal of the request: nothing is wrong with what
 * was asked, it is simply not the moment. Saying which agent and how many
 * because "refused" without a number is a message an operator cannot act on.
 */
export class AgentAlreadyWorkingError extends DomainError {
  constructor(agentId: string, live: number, ceiling: number) {
    super(
      `Agent ${agentId} is already working: ${live} live ` +
        `${live === 1 ? "session" : "sessions"}, and this workspace allows ` +
        `${ceiling}. Raise sessionsPerAgent, or wait for it to finish (§4.12)`,
    );
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
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(AUTOMATION_POLICY) private readonly policy: AutomationPolicy,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
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

    /**
     * §4.12 — the living instance of this agent, opened before the order is.
     *
     * A run answers "what happened to this task"; a session answers "what is
     * this AGENT doing, right now, on which machine". They are different
     * questions, and the second one had no answer at all: the domain was
     * complete — states, transitions, heartbeat, crash — and nothing ever
     * created one. So the machines screen said "0 sessions" while agents were
     * demonstrably working, nobody could count an agent's live instances (and
     * therefore nobody could cap them), and a run that died left nothing
     * saying an agent had died with it.
     *
     * Opened only when the task has an assignee, because a session belongs to
     * an agent by definition. A task nobody holds still runs — it simply is
     * not anybody's instance.
     */
    let sessionId: string | null = null;
    if (assignee) {
      /**
       * §4.12, §17.7 — one agent, one instance, unless the workspace says
       * otherwise.
       *
       * Refused here rather than left to the machine, because the machine
       * would only discover it after starting: two instances of one agent in
       * one checkout queue on each other's locks, and what they lose to
       * contention is more than the parallelism wins. This ceiling protects
       * the WORK; `concurrentRuns` protects the machine and the wallet, which
       * is why they are two numbers and not one.
       */
      const limits = await this.policy.limitsFor(input.workspaceId);
      const live = await this.sessions.list({
        workspaceId: input.workspaceId,
        agent: assignee,
        liveOnly: true,
        limit: limits.sessionsPerAgent + 1,
      });
      if (live.length >= limits.sessionsPerAgent) {
        return Result.fail(
          new AgentAlreadyWorkingError(assignee.actorId, live.length, limits.sessionsPerAgent),
        );
      }

      const session = AgentSession.start({
        workspaceId: input.workspaceId,
        agent: assignee,
        workerId: worker.value,
        provider: input.provider,
        ...(input.model ? { model: input.model } : {}),
        taskId: input.taskId,
        now: this.clock.now(),
      });
      if (session.isFailure) {
        return Result.fail(session.error);
      }
      await this.sessions.save(session.value);
      await flushDomainEvents(session.value, this.publisher);
      sessionId = session.value.id.value;
    }

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
        /**
         * Carried on the order so the machine's own report can move the
         * session without anybody having to search for it. The machine never
         * reads it — it hands the order back and the hub does the rest.
         */
        ...(sessionId ? { sessionId } : {}),
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
