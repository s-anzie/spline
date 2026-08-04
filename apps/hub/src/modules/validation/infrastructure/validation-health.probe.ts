import { Inject, Injectable } from "@nestjs/common";

import { isStale } from "../../../kernel/domain/staleness";
import { HealthSignal, Rollup } from "../../observability/domain/health";
import {
  DEFAULT_STALENESS_MS,
  HealthProbe,
  ProbeContext,
} from "../../observability/domain/ports/health-probe.port";
import {
  VALIDATION_REPOSITORY,
  ValidationRepository,
} from "../domain/ports/validation.repository.port";

/**
 * Work submitted and nobody judging it. §10.9 makes an agent unable to
 * declare its own success, so a pile of pending proofs means finished work
 * that cannot be finished — the failure mode that rule creates and that
 * somebody has to watch.
 */
@Injectable()
export class ValidationHealthProbe implements HealthProbe {
  readonly name = "pending_validations";

  constructor(
    @Inject(VALIDATION_REPOSITORY)
    private readonly validations: ValidationRepository,
  ) {}

  async assess(context: ProbeContext): Promise<HealthSignal> {
    const { thresholdMs, source } = context.thresholdMsFor(
      "staleness_pending_validations_ms",
      DEFAULT_STALENESS_MS.staleness_pending_validations_ms,
    );
    const validations = await this.validations.list({
      workspaceId: context.workspaceId,
      statuses: ["PENDING", "RUNNING"],
    });
    const waiting = validations
      .filter((validation) => isStale(validation.createdAt, thresholdMs, context.now))
      .map((validation) => ({
        id: validation.id.value,
        type: `validation:${validation.type}`,
        since: validation.createdAt,
      }));

    return HealthSignal.from({
      probe: this.name,
      rollup: Rollup.of(waiting),
      thresholdMs,
      thresholdSource: source,
      degradedAt: 5,
      unhealthyAt: 20,
    });
  }
}
