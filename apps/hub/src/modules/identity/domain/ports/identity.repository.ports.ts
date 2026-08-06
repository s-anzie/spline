import { ActorRef } from "../actor";
import { ActorCredential } from "../actor-credential";
import { RefreshSession } from "../refresh-session";
import { TaskGrant } from "../task-grant";
import { Organization } from "../organization";
import { WorkspaceRole } from "../permission-matrix";
import { User } from "../user";
import { WorkspaceMembership } from "../workspace-membership";

export interface UserRepository {
  save(user: User): Promise<void>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
}
export const USER_REPOSITORY = "identity/UserRepository";

export interface OrganizationRepository {
  save(organization: Organization): Promise<void>;
  findById(id: string): Promise<Organization | null>;
  listByOwnerId(ownerId: string): Promise<Organization[]>;
}
export const ORGANIZATION_REPOSITORY = "identity/OrganizationRepository";

export interface WorkspaceMembershipRepository {
  save(membership: WorkspaceMembership): Promise<void>;
  findById(id: string): Promise<WorkspaceMembership | null>;
  findByActorAndWorkspace(
    actor: ActorRef,
    workspaceId: string,
  ): Promise<WorkspaceMembership | null>;
  listByWorkspace(workspaceId: string): Promise<WorkspaceMembership[]>;
  listByActor(actor: ActorRef): Promise<WorkspaceMembership[]>;
  countByWorkspaceAndRole(workspaceId: string, role: WorkspaceRole): Promise<number>;
  delete(id: string): Promise<void>;
}
export const WORKSPACE_MEMBERSHIP_REPOSITORY = "identity/WorkspaceMembershipRepository";

export interface ActorCredentialRepository {
  save(credential: ActorCredential): Promise<void>;
  findById(id: string): Promise<ActorCredential | null>;
  listByActor(actor: ActorRef): Promise<ActorCredential[]>;
  /**
   * The registry of an organization's non-human actors, since the credential
   * set is that registry (v3 has no Agent entity). Revoked ones included: an
   * actor whose last credential was revoked still existed, and hiding it
   * would make its history unreachable.
   */
  listByOrganization(organizationId: string, limit?: number): Promise<ActorCredential[]>;
}
export const ACTOR_CREDENTIAL_REPOSITORY = "identity/ActorCredentialRepository";

/** §18.2 — short-lived, task-scoped credentials (§18.10). */
export interface TaskGrantRepository {
  save(grant: TaskGrant): Promise<void>;
  findById(id: string): Promise<TaskGrant | null>;
  /** Live grants for a task, so revoking one revokes the set. */
  listForTask(workspaceId: string, taskId: string): Promise<TaskGrant[]>;
}
export const TASK_GRANT_REPOSITORY = "identity/TaskGrantRepository";

/**
 * §18 — where a browser's long-lived session credentials live.
 *
 * `revokeFamily` is the one operation that justifies the whole shape: the
 * answer to a replayed credential is to kill every link in its chain at once,
 * and doing that link by link would leave the thief's successor alive for as
 * long as the walk takes.
 */
export interface RefreshSessionRepository {
  save(session: RefreshSession): Promise<void>;
  findById(id: string): Promise<RefreshSession | null>;
  revokeFamily(familyId: string, now: Date): Promise<number>;
  /** Housekeeping: a spent or expired link proves nothing after its window. */
  deleteExpiredBefore(cutoff: Date): Promise<number>;
}
export const REFRESH_SESSION_REPOSITORY = "identity/RefreshSessionRepository";
