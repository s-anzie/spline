import { Inject, Injectable, Logger } from "@nestjs/common";
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
 * §4.12, §17.9 — an agent's instance never outlives the work it was doing.
 *
 * Reporting an order already ends its session, and for the ordinary path that
 * is enough. This exists for the path where nobody reports: the machine that
 * held the order is exactly the thing that stopped answering, so the only
 * account of the ending comes from the sweep that buries silent runs (§9.13).
 *
 * Without it, a machine that was unplugged left sessions that said RUNNING
 * forever — which is worse than saying nothing, because a ceiling counted
 * against them and an operator reading the screen was told an agent was
 * working when its computer had been off for a day.
 *
 * Listening to the FACT rather than calling across modules: the sweep lives in
 * execution, sessions live here, and execution has no business knowing that
 * sessions exist. It is also why every path that fails a run is covered by
 * this and not only the one that prompted it.
 */
@Injectable()
export class EndSessionWithRunListener {
  private readonly logger = new Logger(EndSessionWithRunListener.name);

  constructor(
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  @OnEvent("execution.run_finished")
  async handle(event: {
    workspaceId: string | null;
    taskId: string;
    status: string;
    failureReason: string | null;
  }): Promise<void> {
    if (event.workspaceId === null) {
      return;
    }

    /**
     * Matched on the task rather than the session id, because the fact does
     * not carry one — a run knows what it was for, not which instance was
     * doing it. Live only: sessions of earlier attempts on the same task have
     * already ended, and re-ending them would be rewriting history.
     */
    const live = await this.sessions.list({
      workspaceId: event.workspaceId,
      taskId: event.taskId,
      liveOnly: true,
    });

    for (const session of live) {
      const ended =
        event.status === "SUCCEEDED"
          ? session.changeStatus("STOPPED", this.clock.now())
          : session.changeStatus(
              "CRASHED",
              this.clock.now(),
              event.failureReason ?? "the run ended without a report",
            );
      if (ended.isFailure) {
        // Already terminal — the ordinary path got here first, which is the
        // common case and not a problem. Nothing to say and nothing to do.
        continue;
      }
      await this.sessions.save(session);
      await flushDomainEvents(session, this.publisher);
      this.logger.log(
        `Session ${session.id.value} ended with its run (${event.status}).`,
      );
    }
  }
}
