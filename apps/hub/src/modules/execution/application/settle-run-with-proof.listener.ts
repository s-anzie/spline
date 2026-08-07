import { Inject, Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { TASK_PROOF, TaskProofPort } from "../../task/domain/ports/task-proof.port";
import { RUN_REPOSITORY, RunRepository } from "../domain/ports/run.repository.port";

/**
 * §11, §4.24 — the end of the loop, which did not exist.
 *
 * A run reaching VALIDATING stayed there for ever. Nothing in the application
 * layer ever called `run.complete()` — the only caller of that method was a
 * unit test — so an agent that did its work, asked for proof exactly as
 * §10.9 requires, and reported back, left a run that waited until somebody
 * buried it for silence hours later.
 *
 * From outside it looked like the agent had stalled. It had not. It had
 * finished, and there was nowhere for "finished" to go.
 *
 * The rule is §11's, unchanged: an agent never decides its own work is
 * complete. What this adds is the other half — once something ELSE has
 * decided, the decision has to land somewhere. A verdict nobody acts on is
 * the same as no verdict at all.
 */
@Injectable()
export class SettleRunWithProofListener {
  private readonly logger = new Logger(SettleRunWithProofListener.name);

  constructor(
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(TASK_PROOF) private readonly proof: TaskProofPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  /**
   * ALL of a task's mandatory proof, not the one that just passed.
   *
   * Completing on the first verdict would let one green check finish work
   * that two others still refuse, which is the failure §8.7 already guards
   * against for merges — asked here the same way, of the same port, so the
   * two cannot drift into disagreeing about what "proven" means.
   */
  @OnEvent("validation.succeeded")
  async passed(event: { workspaceId: string | null; taskId: string }): Promise<void> {
    if (event.workspaceId === null) {
      return;
    }
    const outstanding = await this.proof.unsatisfiedMandatory(event.taskId);
    if (outstanding.length > 0) {
      return;
    }
    await this.settle(event.workspaceId, event.taskId, null);
  }

  /**
   * §11 — proof that fails means the work is not done.
   *
   * The run fails with it, so a retry is a NEW run (§9.12) rather than a
   * second life for this one. The type is named in the reason because
   * "validation failed" sends a reader hunting for which.
   */
  @OnEvent("validation.failed")
  async refused(event: {
    workspaceId: string | null;
    taskId: string;
    type: string;
  }): Promise<void> {
    if (event.workspaceId === null) {
      return;
    }
    await this.settle(
      event.workspaceId,
      event.taskId,
      `its ${event.type} proof did not pass`,
    );
  }

  private async settle(
    workspaceId: string,
    taskId: string,
    failure: string | null,
  ): Promise<void> {
    /**
     * The run this proof was about: the newest one waiting on it. Older runs
     * of the same task have already been decided, and re-deciding them would
     * rewrite a history §9.12 keeps on purpose.
     */
    const waiting = (await this.runs.list({ workspaceId, taskId, limit: 20 }))
      .filter((run) => run.status === "VALIDATING")
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    const run = waiting[0];
    if (!run) {
      return;
    }

    const now = this.clock.now();
    const moved = failure === null ? run.complete(now) : run.fail(failure, now);
    if (moved.isFailure) {
      // Decided by somebody else between the read and here. Theirs stands.
      return;
    }
    await this.runs.save(run);
    await flushDomainEvents(run, this.publisher);
    this.logger.log(
      `Run ${run.id.value} ${failure === null ? "completed" : "failed"} on its proof.`,
    );
  }
}
