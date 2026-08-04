import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { UseCase } from "../../../kernel/application/use-case";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { AuditRecord, AuditTrail } from "../../../kernel/domain/ports/audit-trail.port";
import { Result } from "../../../kernel/domain/result";
import { AuditEntry } from "../domain/audit-entry";
import { signEntry } from "../domain/audit-signature";
import {
  AUDIT_REPOSITORY,
  AuditRepository,
} from "../domain/ports/audit.repository.port";

/**
 * The only writer. There is no HTTP route behind it: an audit entry is earned
 * by acting, never declared — an endpoint saying "add an entry" would let
 * anyone manufacture a past.
 */
@Injectable()
export class RecordAuditEntryUseCase
  implements UseCase<AuditRecord, Result<{ entryId: string }, GuardViolation>>, AuditTrail
{
  private readonly logger = new Logger(RecordAuditEntryUseCase.name);

  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly entries: AuditRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly config: ConfigService,
  ) {}

  async execute(input: AuditRecord): Promise<Result<{ entryId: string }, GuardViolation>> {
    const entry = AuditEntry.record({ ...input, now: this.clock.now() });
    if (entry.isFailure) {
      return Result.fail(entry.error);
    }

    const key = this.config.getOrThrow<string>("AUDIT_SIGNING_KEY");
    const stored = await this.entries.append(entry.value, (signed, previous) =>
      signEntry(signed, previous, key),
    );
    return Result.ok({ entryId: stored.id.value });
  }

  /**
   * The kernel-facing contract. A failed audit write must not undo the action
   * it describes — someone's role really did change — so it is logged loudly
   * rather than thrown. §18.1 asks for "Audit First", not "Audit Or Nothing",
   * and losing the trail silently is the only outcome worth ruling out.
   */
  async record(entry: AuditRecord): Promise<void> {
    const result = await this.execute(entry);
    if (result.isFailure) {
      this.logger.error(
        `Audit NOT recorded for ${entry.action} on ${entry.targetType}:${entry.targetId} — ${result.error.message}`,
      );
    }
  }
}
