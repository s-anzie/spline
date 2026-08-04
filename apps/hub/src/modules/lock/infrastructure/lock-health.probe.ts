import { Inject, Injectable } from "@nestjs/common";

import { isExpired } from "../../../kernel/domain/staleness";
import { HealthSignal, Rollup } from "../../observability/domain/health";
import {
  DEFAULT_STALENESS_MS,
  HealthProbe,
  ProbeContext,
} from "../../observability/domain/ports/health-probe.port";
import { LOCK_REPOSITORY, LockRepository } from "../domain/ports/lock.repository.port";

/**
 * A lock still marked HELD long after its lease ran out: nobody has asked for
 * that resource since, so the lazy cleanup (§13.6) never fired, and its
 * holder left without giving it back. Harmless on its own, a sign of stalled
 * work when there are several.
 */
@Injectable()
export class LockHealthProbe implements HealthProbe {
  readonly name = "locks";

  constructor(@Inject(LOCK_REPOSITORY) private readonly locks: LockRepository) {}

  async assess(context: ProbeContext): Promise<HealthSignal> {
    const { thresholdMs, source } = context.thresholdMsFor(
      "staleness_locks_ms",
      DEFAULT_STALENESS_MS.staleness_locks_ms,
    );
    const locks = await this.locks.list({ workspaceId: context.workspaceId });
    const abandoned = locks
      .filter(
        (lock) =>
          lock.status === "HELD" &&
          isExpired(new Date(lock.expiresAt.getTime() + thresholdMs), context.now),
      )
      .map((lock) => ({
        id: lock.id.value,
        type: `lock:${lock.resourceType}`,
        // Since the lease ran out, not since it was taken: that is when it
        // started being a problem.
        since: lock.expiresAt,
      }));

    return HealthSignal.from({
      probe: this.name,
      rollup: Rollup.of(abandoned),
      thresholdMs,
      thresholdSource: source,
      degradedAt: 3,
      unhealthyAt: 10,
    });
  }
}
