/**
 * A fact that already happened, never an intention (v3 spec §4.20).
 * eventName uses dot-separated segments ("workspace.created") so wildcard
 * subscribers can relay whole categories.
 */
export interface DomainEvent {
  readonly eventName: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
  /**
   * §4.20 requires a workspace on every Event — without it a journal cannot
   * be filtered per workspace, which breaks isolation (§4.2) and Workspace
   * Memory (§16.3). Nullable on purpose: some facts sit above workspaces
   * (a user registering, an organization being created, tomorrow an
   * extension being published).
   */
  readonly workspaceId: string | null;
}
