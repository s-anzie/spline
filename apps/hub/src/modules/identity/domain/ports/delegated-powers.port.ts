import { Permission } from "../permission-matrix";
import { WorkspaceRole } from "../permission-matrix";

/**
 * §18.3 — powers a workspace's owner has deliberately lent to a role, beyond
 * what the matrix grants it.
 *
 * The matrix is the rule and stays the rule. This is the exception an owner
 * signs, per workspace, and it exists because of one case that could not be
 * solved any other way: `approve_validation`.
 *
 * The matrix's structural invariant — no agent role holds that permission —
 * is about §10.9: an agent never decides its own work is complete. That is
 * right and it stays. But applied to the whole role it also made every piece
 * of proof a human errand, so a team could not finish anything overnight
 * without waking somebody. The two are separable, and what separates them is
 * the ACTOR: a manager judging a contributor's work is somebody else judging.
 *
 * Declared here, in the module that decides authorization, and supplied by
 * the module that holds workspace settings — the consumer owns the port.
 * Identity must not learn to read a workspace's configuration.
 */
export interface DelegatedPowers {
  /**
   * What this workspace has lent to this role. Empty for every role and every
   * workspace that has not signed anything, which is the ordinary case.
   */
  lentTo(role: WorkspaceRole, workspaceId: string): Promise<readonly Permission[]>;
}

export const DELEGATED_POWERS = "identity/DelegatedPowers";
