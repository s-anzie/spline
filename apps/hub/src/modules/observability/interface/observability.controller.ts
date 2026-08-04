import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";

import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import { AssessWorkspaceHealthUseCase } from "../application/assess-workspace-health.use-case";
import { HealthSignal, WorkspaceHealth } from "../domain/health";

function toSignalView(signal: HealthSignal, now: Date) {
  const ages = signal.rollup.ageMsAt(now);
  return {
    probe: signal.probe,
    level: signal.level,
    reason: signal.reason,
    /**
     * §17.8 — the aggregate count for the overview AND the named detail for
     * the investigation, never one without the other. The count is derived
     * from the list rather than sent alongside it, so the two cannot drift.
     */
    count: signal.rollup.count,
    resources: signal.rollup.items.map((item, index) => ({
      id: item.id,
      type: item.type,
      since: item.since.toISOString(),
      degradedForMs: ages[index],
    })),
    /** Which window was applied, and whether a policy set it (§17.7). */
    threshold:
      signal.thresholdMs === null
        ? null
        : { ms: signal.thresholdMs, source: signal.thresholdSource },
  };
}

function toView(health: WorkspaceHealth, now: Date) {
  return {
    workspaceId: health.workspaceId,
    /** The worst signal decides: a system is not healthy on average. */
    level: health.level,
    totalDegraded: health.totalDegraded,
    signals: health.signals.map((signal) => toSignalView(signal, now)),
    assessedAt: now.toISOString(),
  };
}

@Controller("workspaces/:workspaceId/health")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class ObservabilityController {
  constructor(
    private readonly assess: AssessWorkspaceHealthUseCase,
    // §17.7's arithmetic runs on the injected clock like every other temporal
    // calculation in the system — `new Date()` here would be the one place
    // the rule is broken, and the hardest to notice.
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Reading a workspace's health is supervision (§17.1), not administration:
   * an agent about to work should be able to see that the workspace it is
   * working in is degraded.
   */
  @Get()
  @RequirePermission("read_workspace_state")
  async health(@Param("workspaceId") workspaceId: string) {
    const result = await this.assess.execute({ workspaceId });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return toView(result.value, this.clock.now());
  }
}
