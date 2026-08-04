/**
 * "How long may an actor hold this resource in this workspace?"
 *
 * §12.1 lists "limites" among what a policy expresses, and §13 says a lock
 * always has a lifetime — so how long is exactly a workspace rule. The lock
 * module owns the need, the Policy Engine owns the rule, so the port is
 * declared here and supplied there. Nothing in lock/ imports policy/.
 */
export interface LockTtlPolicyPort {
  /** The ceiling in milliseconds, or null when the workspace sets none. */
  maxTtlMsFor(workspaceId: string): Promise<number | null>;
}
export const LOCK_TTL_POLICY = "lock/LockTtlPolicyPort";
