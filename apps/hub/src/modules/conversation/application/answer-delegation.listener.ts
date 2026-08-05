import { Inject, Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import {
  THREAD_REPOSITORY,
  ThreadRepository,
} from "../domain/ports/thread.repository.port";

/**
 * What a task's status change carries. Read STRUCTURALLY, never by importing
 * the task module's classes: a conversation that imported task would make two
 * modules with no reason to know each other inseparable, and this needs two
 * fields.
 *
 * The shape was checked against `task-events.ts` rather than assumed. The
 * first version of this listener subscribed to `task.completed` and
 * `task.failed`, which are not events this system emits — it would have
 * compiled, passed review, and never once fired.
 */
interface TaskStatusChangedFact {
  aggregateId: string;
  to: string;
}

/** The endings that answer a delegation. Blocked or running is not an answer. */
const SETTLED = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

/**
 * §10.18a — "il s'exécute dans une session isolée et **annonce son résultat
 * en retour**". This is the announcement.
 *
 * Without it, delegation is only half built: the asker would have to poll to
 * discover the work finished, which is the bottleneck OpenClaw's own issue
 * complains about — every result travelling back through whoever thought to
 * look.
 */
@Injectable()
export class AnswerDelegationListener {
  private readonly logger = new Logger(AnswerDelegationListener.name);

  constructor(
    @Inject(THREAD_REPOSITORY) private readonly threads: ThreadRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  /**
   * Every ending, not just the happy one: a delegation that failed is still
   * an answer, and a listener that only heard about success would leave the
   * asker waiting forever on exactly the outcome it most needs to hear.
   */
  @OnEvent("task.status_changed")
  async onTaskSettled(event: TaskStatusChangedFact): Promise<void> {
    if (!SETTLED.has(event.to)) {
      return;
    }
    const awaiting = await this.threads.listAwaiting(event.aggregateId);
    if (awaiting.length === 0) {
      return;
    }

    const now = this.clock.now();
    for (const thread of awaiting) {
      /**
       * Delivered as the PARTICIPANT — the one the work was delegated to.
       * Attributing it to the asker would make the record say they answered
       * their own question.
       */
      const delivered = thread.deliver(
        thread.participant,
        { taskId: event.aggregateId, status: event.to },
        now,
      );
      if (delivered.isFailure) {
        // A thread that closed between the query and here: the asker stopped
        // waiting, which is not a failure of anything.
        this.logger.debug(
          `Thread ${thread.id.value} took no answer: ${delivered.error.message}`,
        );
        continue;
      }
      await this.threads.save(thread);
      await flushDomainEvents(thread, this.publisher);
    }
  }
}
