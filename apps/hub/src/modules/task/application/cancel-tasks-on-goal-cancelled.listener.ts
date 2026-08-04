import { Inject, Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { GoalStatusChanged } from "../../goal/domain/goal-events";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";

/**
 * Cancelling an objective must not leave live work attached to it. Done by
 * reacting to the goal's event rather than by the goal calling into tasks:
 * the dependency stays task → goal, and this is the first real consumer of
 * the domain event bus.
 */
@Injectable()
export class CancelTasksOnGoalCancelledListener {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  @OnEvent("goal.status_changed")
  async handle(event: GoalStatusChanged): Promise<void> {
    if (event.to !== "CANCELLED") {
      return;
    }

    const now = this.clock.now();
    for (const task of await this.tasks.list({
      workspaceId: event.workspaceId,
      goalId: event.aggregateId,
    })) {
      // Settled work keeps its outcome: history is never rewritten.
      if (task.isTerminal) {
        continue;
      }
      const cancelled = task.changeStatus("CANCELLED", now);
      if (cancelled.isFailure) {
        continue;
      }
      await this.tasks.save(task);
      flushDomainEvents(task, this.publisher);
    }
  }
}
