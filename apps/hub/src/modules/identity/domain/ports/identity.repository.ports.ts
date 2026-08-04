import { ActorRef } from "../actor";
import { ActorCredential } from "../actor-credential";
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
}
export const ACTOR_CREDENTIAL_REPOSITORY = "identity/ActorCredentialRepository";
