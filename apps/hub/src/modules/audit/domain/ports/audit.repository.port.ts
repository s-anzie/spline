import { ActorRef } from "../../../identity/domain/actor";
import { AuditEntry } from "../audit-entry";

export interface ListAuditFilter {
  /** Mandatory (§4.2): there is no unscoped reading of the trail. */
  workspaceId: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  actor?: ActorRef;
  limit?: number;
}

/**
 * A trail grows without bound and nothing prunes it (§4.23 keeps everything),
 * so an unfiltered read is a page, never the whole thing — the same lesson
 * the event journal had to learn.
 */
export const DEFAULT_AUDIT_PAGE = 100;
export const MAX_AUDIT_PAGE = 500;

export interface AuditRepository {
  /**
   * Appends, and returns the entry with the sequence and signature the store
   * assigned. The signing function is passed in rather than imported so the
   * key never has to travel through the domain.
   *
   * There is no update and no delete on this port — not even a private one
   * (§4.23, §18.7).
   */
  append(
    entry: AuditEntry,
    sign: (entry: AuditEntry, previousSignature: string) => string,
  ): Promise<AuditEntry>;
  findById(id: string): Promise<AuditEntry | null>;
  list(filter: ListAuditFilter): Promise<AuditEntry[]>;
  /** The whole chain of a workspace, in order, for verification. */
  listChain(workspaceId: string): Promise<AuditEntry[]>;
}
export const AUDIT_REPOSITORY = "audit/AuditRepository";
