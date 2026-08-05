import { Global, Inject, Injectable, Module } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import {
  ACTIVE_RUNS,
  ActiveRun,
  ActiveRuns,
} from "../../scheduling/domain/ports/preemption.port";
import { ExecutionModule } from "../execution.module";
import { RUN_REPOSITORY, RunRepository } from "../domain/ports/run.repository.port";

/**
 * §9.14 — supplies what scheduling declares, answering the half of the
 * condition only this module can: "la reprise possible".
 *
 * A run is resumable when its last attempt names a provider that could pick
 * it up again (§4.8, 0.3.11). A run that has never attempted anything is NOT
 * resumable — there is nothing to resume, and interrupting it would lose
 * whatever the worker was doing without a record of what that was.
 */
@Injectable()
export class ActiveRunsAdapter implements ActiveRuns {
  constructor(
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async activeRunFor(workspaceId: string, taskId: string): Promise<ActiveRun | null> {
    const live = await this.runs.listLive(workspaceId);
    const run = live.find(
      (candidate) => candidate.taskId === taskId && candidate.startedAt !== null,
    );
    if (!run) {
      return null;
    }
    const last = run.attempts.at(-1);
    return {
      runId: run.id.value,
      startedAt: run.startedAt as Date,
      // Asking the aggregate rather than reimplementing the rule here: the
      // refusal and this question must never be able to disagree.
      resumable: last ? run.resumableBy(last.provider).isSuccess : false,
    };
  }

  async abandon(workspaceId: string, runId: string, reason: string): Promise<void> {
    const run = await this.runs.findById(runId);
    if (!run || run.workspaceId !== workspaceId) {
      return;
    }
    // `fail` closes the attempt as ABANDONED rather than leaving a
    // measurement that counts as still in flight forever.
    const failed = run.fail(reason, this.clock.now());
    if (failed.isFailure) {
      return;
    }
    await this.runs.save(run);
    await flushDomainEvents(run, this.publisher);
  }
}

@Global()
@Module({
  imports: [ExecutionModule],
  providers: [{ provide: ACTIVE_RUNS, useClass: ActiveRunsAdapter }],
  exports: [ACTIVE_RUNS],
})
export class ActiveRunsModule {}
