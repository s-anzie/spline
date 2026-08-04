import { AuditRecord, AuditTrail } from "../domain/ports/audit-trail.port";

/** Captures what would have been audited, so a test can assert on it. */
export class FakeAuditTrail implements AuditTrail {
  readonly recorded: AuditRecord[] = [];

  async record(entry: AuditRecord): Promise<void> {
    this.recorded.push(entry);
  }
}
