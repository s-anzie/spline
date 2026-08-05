import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Priority } from "../../../kernel/domain/priority";
import { Result } from "../../../kernel/domain/result";
import {
  ACTIVE_RUNS,
  ActiveRuns,
  PREEMPTABLE_TASKS,
  PreemptableTasks,
  RECLAIMABLE_LEASES,
  ReclaimableLeases,
} from "../domain/ports/preemption.port";
import {
  choosePreemptionVictim,
  NoPreemptableTaskError,
  PreemptionCandidate,
} from "../domain/preemption";

export interface PreemptInput {
  workspaceId: string;
  /** The task that needs room to run. */
  claimantTaskId: string;
  claimantPriority: Priority;
}

export interface PreemptOutput {
  /** §17.8 — who was interrupted, never just "one task was". */
  preemptedTaskId: string;
  runId: string;
}

/**
 * §9.14 — "Une tâche critique peut interrompre une tâche moins prioritaire si
 * le Lease est récupérable et la reprise possible."
 *
 * The decision is a pure function (`choosePreemptionVictim`) so it can be read
 * and replayed; this use case is only the gathering and the acting. That split
 * matters: the interesting question — why THAT task — has an answer that does
 * not depend on any database state at the moment it is asked.
 *
 * The order of the acting is deliberate. The task is interrupted FIRST, and
 * the lease released LAST: a lease released while the task still believes it
 * is running is an invitation for somebody else to take it and collide. The
 * transaction around the request (§14.1) makes the whole sequence atomic
 * anyway — but an order that only works because of a transaction is an order
 * that breaks the day it runs outside one.
 */
@Injectable()
export class PreemptForTaskUseCase
  implements UseCase<PreemptInput, Result<PreemptOutput, NoPreemptableTaskError>>
{
  constructor(
    @Inject(PREEMPTABLE_TASKS) private readonly tasks: PreemptableTasks,
    @Inject(ACTIVE_RUNS) private readonly runs: ActiveRuns,
    @Inject(RECLAIMABLE_LEASES) private readonly leases: ReclaimableLeases,
  ) {}

  async execute(
    input: PreemptInput,
  ): Promise<Result<PreemptOutput, NoPreemptableTaskError>> {
    const candidates: PreemptionCandidate[] = [];

    for (const running of await this.tasks.listRunning(input.workspaceId)) {
      // A task cannot preempt itself, and asking would be a strange thing to
      // have to explain in the refusal.
      if (running.taskId === input.claimantTaskId) {
        continue;
      }
      const run = await this.runs.activeRunFor(input.workspaceId, running.taskId);
      if (!run) {
        // Running with no run on record: nothing here can say what
        // interrupting it would lose, so it is left alone.
        continue;
      }
      candidates.push({
        taskId: running.taskId,
        runId: run.runId,
        priority: running.priority,
        startedAt: run.startedAt,
        resumable: run.resumable,
        lockReclaimable: await this.leases.isReclaimable(
          input.workspaceId,
          running.taskId,
        ),
      });
    }

    const chosen = choosePreemptionVictim(input.claimantPriority, candidates);
    if (chosen.isFailure) {
      return Result.fail(chosen.error);
    }
    const victim = chosen.value;

    const reason = `preempted by ${input.claimantTaskId} (${input.claimantPriority}) — §9.14`;
    const interrupted = await this.tasks.interrupt(
      input.workspaceId,
      victim.taskId,
      reason,
    );
    if (!interrupted) {
      // The task moved between the read and the act. Refused rather than
      // forced: the state it is in now was not the one this decision was made
      // against.
      return Result.fail(
        new NoPreemptableTaskError([
          `${victim.taskId} changed state while it was being interrupted`,
        ]),
      );
    }

    await this.runs.abandon(input.workspaceId, victim.runId, reason);
    await this.leases.reclaim(input.workspaceId, victim.taskId, reason);

    return Result.ok({ preemptedTaskId: victim.taskId, runId: victim.runId });
  }
}
