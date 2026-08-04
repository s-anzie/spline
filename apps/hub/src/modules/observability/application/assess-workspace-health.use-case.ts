import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { Result } from "../../../kernel/domain/result";
import { WorkspaceHealth } from "../domain/health";
import { HEALTH_PROBES, HealthProbe } from "../domain/ports/health-probe.port";
import {
  STALENESS_THRESHOLDS,
  StalenessThresholdsPort,
} from "../domain/ports/staleness-thresholds.port";

export interface AssessHealthInput {
  workspaceId: string;
}

/**
 * §17.6 and §17.8 — the overall level AND every probe's named detail.
 *
 * Thresholds are resolved once here, for all probes, so a workspace's rules
 * are read from one place and every probe reports the same source (§17.7).
 */
@Injectable()
export class AssessWorkspaceHealthUseCase
  implements UseCase<AssessHealthInput, Result<WorkspaceHealth, GuardViolation>>
{
  constructor(
    @Inject(HEALTH_PROBES) private readonly probes: readonly HealthProbe[],
    @Inject(STALENESS_THRESHOLDS)
    private readonly thresholds: StalenessThresholdsPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    input: AssessHealthInput,
  ): Promise<Result<WorkspaceHealth, GuardViolation>> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }

    const configured = new Map<string, number | null>();
    for (const rule of RULES) {
      configured.set(rule, await this.thresholds.thresholdMsFor(workspaceId.value, rule));
    }

    const context = {
      workspaceId: workspaceId.value,
      now: this.clock.now(),
      thresholdMsFor: (rule: string, fallbackMs: number) => {
        const fromPolicy = configured.get(rule) ?? null;
        return fromPolicy === null
          ? { thresholdMs: fallbackMs, source: "default" as const }
          : { thresholdMs: fromPolicy, source: "policy" as const };
      },
    };

    const signals = await Promise.all(
      this.probes.map((probe) => probe.assess(context)),
    );
    return Result.ok(WorkspaceHealth.of(workspaceId.value, signals));
  }
}

/**
 * The rules a workspace may set. Listed once so the resolution is a single
 * pass rather than one query per probe — and so §17.7's "documentés" has a
 * place to point at.
 */
const RULES = [
  "staleness_locks_ms",
  "staleness_blocked_tasks_ms",
  "staleness_pending_validations_ms",
  "staleness_workers_ms",
  "staleness_sessions_ms",
] as const;
