import { Global, Inject, Injectable, Module } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import {
  RETRYABLE_TASK,
  RetryableTask,
  RetryOutcome,
} from "../../execution/domain/ports/run.repository.port";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { TaskModule } from "../task.module";

/**
 * Supplies the port the execution module DECLARES (§9.12), following the
 * inversion rule this codebase applies everywhere: the consumer declares, the
 * provider supplies. Execution never imports the task module, so neither has
 * to be read to change the other.
 *
 * What is decided here and nowhere else: whether a task's current state
 * allows a retry. Execution knows a retry creates a run; only this module
 * knows what a task's states mean.
 */
@Injectable()
export class TaskRetryAdapter implements RetryableTask {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async reopenForRetry(taskId: string, workspaceId: string): Promise<RetryOutcome> {
    const task = await this.tasks.findById(taskId);
    // §4.2 — a task of another workspace is simply not there.
    if (!task || task.workspaceId !== workspaceId) {
      return { retryable: false, reason: `Task "${taskId}" was not found` };
    }

    /**
     * The state machine already says FAILED → ASSIGNED. Reusing it rather
     * than testing the status by hand means a future change to what a retry
     * may follow lands in one place — and the refusal below names the states
     * that WOULD work (§20.6) instead of asserting one that does not.
     */
    const reopened = task.changeStatus("ASSIGNED", this.clock.now());
    if (reopened.isFailure) {
      return {
        retryable: false,
        reason:
          `A ${task.status} task cannot be retried. From here it can go to: ` +
          `${task.allowedStatusTargets().join(", ") || "nowhere"} (§9.12)`,
      };
    }

    await this.tasks.save(task);
    await flushDomainEvents(task, this.publisher);
    return { retryable: true, goalId: task.goalId };
  }
}

/**
 * Global for the reason recorded in the kernel doc: a provider's tokens
 * resolve inside its OWN module, so a binding consumed by another module has
 * to be visible from there.
 *
 * And it must IMPORT the task module rather than merely be exported by it —
 * the adapter's own dependency, `TASK_REPOSITORY`, resolves in this module,
 * not in whoever consumes it. Getting that backwards is a startup failure
 * with a message that names the consumer, and the kernel doc records it
 * because it cost time to read the first time.
 */
@Global()
@Module({
  imports: [TaskModule],
  providers: [{ provide: RETRYABLE_TASK, useClass: TaskRetryAdapter }],
  exports: [RETRYABLE_TASK],
})
export class TaskRetryModule {}
