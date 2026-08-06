import { Global, Inject, Injectable, Module } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { ActorRef } from "../../identity/domain/actor";
import {
  CONFLICT_REPORT,
  ConflictReport,
} from "../../runtime/domain/ports/conflict-report.port";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { TaskModule } from "../task.module";

/** What a conflict blocker's description begins with, so a repeat is recognisable. */
const CONFLICT_PREFIX = "Merge conflict:";

/**
 * §8.8, §8.9 — the machine found a conflict, so the task is blocked.
 *
 * A blocker rather than a new entity, because that is what §8.9 says a
 * conflict IS: an unresolved one blocks the task. Tasks have had blockers
 * since §4.22, they already move a task to BLOCKED, they already appear in
 * the queue as something needing a person, and the manager already sees them.
 * Modelling a Conflict beside all that would have been a second word for one
 * thing, with its own screen and its own way of being forgotten.
 *
 * `TECHNICAL` is the type: a conflict is not waiting on a person's decision
 * (`APPROVAL`) nor on another task (`DEPENDENCY`) — it is the work itself
 * being in a state nobody can proceed from.
 */
@Injectable()
export class ConflictReportAdapter implements ConflictReport {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async blockOnConflict(input: {
    workspaceId: string;
    taskId: string;
    detail: string;
    reportedBy: ActorRef;
  }): Promise<void> {
    const task = await this.tasks.findById(input.taskId);
    // §4.2 — a task of another workspace is simply not there.
    if (!task || task.workspaceId !== input.workspaceId) {
      return;
    }

    /**
     * Idempotent by description. A run that reports the same conflict twice —
     * a retry, a resumed session — must not stack blockers a person then has
     * to close one by one.
     */
    const already = task.blockers.some(
      (blocker) => blocker.resolvedAt === null && blocker.description.startsWith(CONFLICT_PREFIX),
    );
    if (already) {
      return;
    }

    const reported = task.reportBlocker(
      {
        type: "TECHNICAL",
        description: `${CONFLICT_PREFIX} ${input.detail}`.slice(0, 2000),
        reportedBy: input.reportedBy,
      },
      this.clock.now(),
    );
    // A terminal task cannot be blocked, and a conflict on one is a fact
    // about work already decided. Recorded in the run either way.
    if (reported.isFailure) {
      return;
    }

    await this.tasks.save(task);
    await flushDomainEvents(task, this.publisher);
  }
}

/** Global, and importing TaskModule: see the note in task-retry.adapter.ts. */
@Global()
@Module({
  imports: [TaskModule],
  providers: [
    ConflictReportAdapter,
    { provide: CONFLICT_REPORT, useExisting: ConflictReportAdapter },
  ],
  exports: [CONFLICT_REPORT],
})
export class ConflictReportModule {}
