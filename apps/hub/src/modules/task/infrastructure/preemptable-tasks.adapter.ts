import { Global, Inject, Injectable, Module } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import {
  PREEMPTABLE_TASKS,
  PreemptableTasks,
  RunningTask,
} from "../../scheduling/domain/ports/preemption.port";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { TaskModule } from "../task.module";
import { ActorRef } from "../../identity/domain/actor";

/**
 * Preemption is an act of the system, not of a member. §18.2's SERVICE actor
 * type is what that is — attributing it to whoever happened to create the
 * urgent task would put a decision in their name that they did not make.
 */
const SCHEDULER = ActorRef.create("SERVICE", "scheduler").value;

/**
 * §9.14 — supplies what scheduling declares. Only this module knows what a
 * task's states mean, so only this module decides that interrupting one means
 * BLOCKED and not FAILED.
 *
 * Blocked, specifically, because a task carries where it stood when it got
 * blocked (§4.6): it resumes instead of restarting. Failing it would throw
 * that away and turn preemption into a retry from zero — which is exactly
 * what §9.14's "reprise possible" condition exists to avoid.
 */
@Injectable()
export class PreemptableTasksAdapter implements PreemptableTasks {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async listRunning(workspaceId: string): Promise<RunningTask[]> {
    const running = await this.tasks.list({ workspaceId, statuses: ["RUNNING"] });
    return running.map((task) => ({ taskId: task.id.value, priority: task.priority }));
  }

  async interrupt(
    workspaceId: string,
    taskId: string,
    reason: string,
  ): Promise<boolean> {
    const task = await this.tasks.findById(taskId);
    if (!task || task.workspaceId !== workspaceId) {
      return false;
    }

    const blocked = task.reportBlocker(
      {
        // The obstacle is the scheduler itself, not the work: an EXTERNAL
        // blocker is what "something outside this task stopped it" means, and
        // mislabelling it TECHNICAL would send someone looking at the code.
        type: "EXTERNAL",
        description: reason,
        reportedBy: SCHEDULER,
      },
      this.clock.now(),
    );
    if (blocked.isFailure) {
      return false;
    }

    await this.tasks.save(task);
    await flushDomainEvents(task, this.publisher);
    return true;
  }
}

/** Global, and importing TaskModule: see the note in task-retry.adapter.ts. */
@Global()
@Module({
  imports: [TaskModule],
  providers: [{ provide: PREEMPTABLE_TASKS, useClass: PreemptableTasksAdapter }],
  exports: [PREEMPTABLE_TASKS],
})
export class PreemptableTasksModule {}
