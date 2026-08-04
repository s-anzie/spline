import { Inject, Injectable } from "@nestjs/common";

import { HealthSignal, Rollup } from "../../observability/domain/health";
import {
  HealthProbe,
  ProbeContext,
} from "../../observability/domain/ports/health-probe.port";
import { WORKER_STORE, WorkerStore } from "../domain/ports/runtime.repository.port";

/** §17.7 names Machine first among the monitored resources. */
export const DEFAULT_WORKER_STALENESS_MS = 2 * 60 * 1000;

/**
 * A machine that stopped sending heartbeats (§6.4). §17.9 lists "Worker
 * Offline" among the alerts, and §6.6 makes the Control Plane the one that
 * notices — the machine is gone, it cannot report its own absence.
 */
@Injectable()
export class WorkerHealthProbe implements HealthProbe {
  readonly name = "workers";

  constructor(@Inject(WORKER_STORE) private readonly workers: WorkerStore) {}

  async assess(context: ProbeContext): Promise<HealthSignal> {
    const { thresholdMs, source } = context.thresholdMsFor(
      "staleness_workers_ms",
      DEFAULT_WORKER_STALENESS_MS,
    );
    const workers = await this.workers.listForWorkspace(context.workspaceId);
    const silent = workers
      .filter((worker) => worker.isStaleAt(context.now, thresholdMs))
      .map((worker) => ({
        id: worker.id.value,
        type: `worker:${worker.hostname}`,
        since: worker.lastHeartbeatAt ?? worker.registeredAt,
      }));

    return HealthSignal.from({
      probe: this.name,
      rollup: Rollup.of(silent),
      thresholdMs,
      thresholdSource: source,
      // One silent machine already means work is not being done on it.
      degradedAt: 2,
      unhealthyAt: 5,
    });
  }
}
