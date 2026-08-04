import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { HealthSignal, Rollup } from "../../observability/domain/health";
import {
  HealthProbe,
  ProbeContext,
} from "../../observability/domain/ports/health-probe.port";
import { verifyChain } from "../domain/audit-signature";
import {
  AUDIT_REPOSITORY,
  AuditRepository,
} from "../domain/ports/audit.repository.port";

/**
 * The gravest signal the system can raise: the history has been edited.
 *
 * Declared outright rather than counted — the chain is intact or it is not,
 * and grading it would suggest that a few tampered entries are tolerable.
 */
@Injectable()
export class AuditHealthProbe implements HealthProbe {
  readonly name = "audit_chain";

  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly entries: AuditRepository,
    private readonly config: ConfigService,
  ) {}

  async assess(context: ProbeContext): Promise<HealthSignal> {
    const chain = await this.entries.listChain(context.workspaceId);
    const verification = verifyChain(
      chain,
      this.config.getOrThrow<string>("AUDIT_SIGNING_KEY"),
    );
    if (verification.intact) {
      return HealthSignal.from({
        probe: this.name,
        rollup: Rollup.of([]),
        thresholdMs: 0,
        thresholdSource: "default",
        degradedAt: 1,
        unhealthyAt: 1,
      });
    }

    const broken = chain.find(
      (entry) => entry.id.value === verification.brokenAt?.id,
    );
    return HealthSignal.critical({
      probe: this.name,
      // Named, as §17.8 requires: which entry, and since when.
      rollup: Rollup.of(
        broken
          ? [
              {
                id: broken.id.value,
                type: "audit_entry",
                since: broken.createdAt,
              },
            ]
          : [],
      ),
      reason: `the signature chain breaks at sequence ${verification.brokenAt?.sequence ?? "?"}`,
    });
  }
}
