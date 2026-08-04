import { ActorRef } from "../../../modules/identity/domain/actor";

export interface AuditRecord {
  workspaceId: string | null;
  actor: ActorRef;
  /** Free string; §18.7 names the actions that must produce one. */
  action: string;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * §18.1 makes "Audit First" a principle of the system, and three distinct
 * modules need it (identity, policy, workspace), so the abstraction lives at
 * the kernel — the two entry criteria are met and it carries no business
 * knowledge.
 *
 * Written explicitly by the use case that mutates, never by a listener: an
 * Event does not carry the previous state, and `before`/`after` is the whole
 * point of an audit entry.
 *
 * Deliberately NOT bound here. The audit module is the sole provider, and two
 * global owners of one token is a coin toss dressed up as configuration —
 * the lesson from EVENT_PUBLISHER (kernel §7).
 */
export interface AuditTrail {
  record(entry: AuditRecord): Promise<void>;
}
export const AUDIT_TRAIL = "kernel/AuditTrail";
