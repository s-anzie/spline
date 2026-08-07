import { Inject, Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import {
  SESSION_STORE,
  SessionStore,
} from "../domain/ports/runtime.repository.port";

/**
 * §4.12 — `WAITING` existed in the state machine and nothing ever reached it.
 *
 * So a session blocked on a person looked exactly like one mid-edit: both
 * said RUNNING, and the screen that is supposed to answer "what is this agent
 * doing" answered the same word for the two situations that differ most —
 * one needs nothing from anybody, the other needs YOU.
 *
 * The two things an agent waits on are precisely the two it is not allowed to
 * resolve itself:
 *
 *   - **proof** (§10.9): an agent never decides its own work is complete, so
 *     asking for validation is asking somebody else to move;
 *   - **an obstacle** (§10.8): a blocker it reported is by definition one it
 *     could not get past alone.
 *
 * Both are already facts on the journal, so nothing new has to be recorded to
 * know — which is why this is a listener and not a new call in four use
 * cases. It also means every path that produces one of these facts is covered,
 * including the ones nobody has written yet.
 */
@Injectable()
export class SessionWaitsListener {
  constructor(
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  /** Asked for something only a person (or a check) can give. */
  @OnEvent("validation.requested")
  @OnEvent("task.blocker_reported")
  async waits(event: {
    workspaceId: string | null;
    taskId?: string;
    aggregateId: string;
  }): Promise<void> {
    // A validation names its task; a blocker IS on its task, so the task is
    // the aggregate. One line rather than two listeners.
    await this.move(event.workspaceId, event.taskId ?? event.aggregateId, "WAITING");
  }

  /**
   * Somebody moved. Back to work — including when the answer was no: a
   * validation that failed is still an answer, and an agent that has been
   * told is no longer waiting. What it does with the answer is the run's
   * business, not this listener's.
   */
  @OnEvent("validation.succeeded")
  @OnEvent("validation.failed")
  @OnEvent("task.blocker_resolved")
  async resumes(event: {
    workspaceId: string | null;
    taskId?: string;
    aggregateId: string;
  }): Promise<void> {
    await this.move(event.workspaceId, event.taskId ?? event.aggregateId, "RUNNING");
  }

  private async move(
    workspaceId: string | null,
    taskId: string,
    next: "WAITING" | "RUNNING",
  ): Promise<void> {
    if (workspaceId === null) {
      return;
    }
    const live = await this.sessions.list({ workspaceId, taskId, liveOnly: true });
    for (const session of live) {
      /**
       * A session still STARTING is not waiting on anybody — the machine has
       * not even taken the order. Moving it would say an agent is blocked
       * when no agent has begun.
       */
      if (next === "WAITING" && session.status !== "RUNNING") {
        continue;
      }
      const moved = session.changeStatus(next, this.clock.now());
      if (moved.isFailure) {
        // Terminal, or a transition the machine refuses. Neither is a reason
        // to fail the act that produced the fact — somebody asked for proof,
        // and they got it whatever the session bookkeeping does.
        continue;
      }
      await this.sessions.save(session);
      await flushDomainEvents(session, this.publisher);
    }
  }
}
