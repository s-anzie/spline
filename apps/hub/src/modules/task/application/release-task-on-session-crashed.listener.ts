import { Inject, Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { SessionCrashed } from "../../runtime/domain/agent-session";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";

/**
 * §6.6 — "replace les tâches dans la file. **Aucune tâche ne doit
 * disparaître.**"
 *
 * A task whose agent session died stayed `RUNNING` with nobody running it.
 * The scheduler counts RUNNING as in flight, so it appeared in neither the
 * ready queue nor the waiting list: invisible, and therefore lost in every
 * sense that matters to whoever was waiting for it.
 *
 * The task changes its own status, here, in the task module — §22.6 makes an
 * aggregate's machine its authority, and letting runtime write task statuses
 * would be two owners of one field. Runtime says a session crashed; the task
 * decides what that means for it.
 *
 * It goes to FAILED rather than back to READY, and that is deliberate: the
 * work was interrupted mid-flight and nobody knows how far it got. FAILED is
 * the one live state that says "this needs looking at", and the task machine
 * already allows FAILED → ASSIGNED, so re-running it is one explicit act
 * away. Silently re-queueing would hand the same half-done work to someone
 * else as if it were fresh.
 */
@Injectable()
export class ReleaseTaskOnSessionCrashedListener {
  private readonly logger = new Logger(ReleaseTaskOnSessionCrashedListener.name);

  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  @OnEvent("runtime.session_crashed")
  async handle(event: SessionCrashed): Promise<void> {
    const taskId = event.taskId;
    if (!taskId) {
      // A session with no task is an agent working outside one; nothing to
      // release, and inventing a task here would be worse than doing nothing.
      return;
    }

    const task = await this.tasks.findById(taskId);
    if (!task || task.workspaceId !== event.workspaceId) {
      return;
    }

    const released = task.changeStatus("FAILED", this.clock.now());
    if (released.isFailure) {
      // Already settled, or in a state where FAILED makes no sense. Logged
      // rather than thrown: a task that was already finished is not a problem.
      this.logger.log(
        `Task ${taskId} not released after session ${event.aggregateId} crashed: ${released.error.message}`,
      );
      return;
    }

    await this.tasks.save(task);
    await flushDomainEvents(task, this.publisher);
    this.logger.warn(
      `Task ${taskId} released after its session crashed — it needs looking at before it runs again (§6.6)`,
    );
  }
}
