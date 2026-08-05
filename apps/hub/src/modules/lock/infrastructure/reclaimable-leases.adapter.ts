import { Global, Inject, Injectable, Module } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import {
  RECLAIMABLE_LEASES,
  ReclaimableLeases,
} from "../../scheduling/domain/ports/preemption.port";
import { LOCK_REPOSITORY, LockRepository } from "../domain/ports/lock.repository.port";
import { LockModule } from "../lock.module";

/** The resource type a task's own lease is filed under (§13.2). */
const TASK_RESOURCE = "TASK";

/**
 * §9.14 — supplies what scheduling declares, answering "si le Lease est
 * récupérable".
 *
 * **This answer is currently always yes, and that is worth stating plainly
 * rather than dressing up.** Every lease in this model can be taken back: an
 * expired one is released by definition (§13.5), and a live one can be forced
 * by an operator (§13.6) — which is exactly what preemption is. No flag today
 * marks a lease untouchable, so no adapter can return false.
 *
 * The condition is not decorative for that reason: `choosePreemptionVictim`
 * enforces it, tested, and this method is the only thing that changes the day
 * a non-reclaimable lease exists — a lease on a shared repository mid-write
 * being the obvious first candidate. Inventing a rule here to make the flag
 * look meaningful would be worse than saying it is not one yet.
 */
@Injectable()
export class ReclaimableLeasesAdapter implements ReclaimableLeases {
  constructor(
    @Inject(LOCK_REPOSITORY) private readonly locks: LockRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async isReclaimable(): Promise<boolean> {
    return true;
  }

  /**
   * A task with no lease needs nothing taken back, and saying so is not a
   * failure: preempting an unlocked task is perfectly ordinary.
   */
  async reclaim(workspaceId: string, taskId: string): Promise<void> {
    const lock = await this.locks.findActiveOn(workspaceId, TASK_RESOURCE, taskId);
    if (!lock) {
      return;
    }
    lock.release(this.clock.now());
    await this.locks.save(lock);
    await flushDomainEvents(lock, this.publisher);
  }
}

@Global()
@Module({
  imports: [LockModule],
  providers: [{ provide: RECLAIMABLE_LEASES, useClass: ReclaimableLeasesAdapter }],
  exports: [RECLAIMABLE_LEASES],
})
export class ReclaimableLeasesModule {}
