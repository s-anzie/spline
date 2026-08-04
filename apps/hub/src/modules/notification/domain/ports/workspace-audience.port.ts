import { ActorRef } from "../../../identity/domain/actor";

/**
 * "Who are the recipients of a broadcast in this workspace?"
 *
 * The rule "a broadcast resolves its recipients at creation" (§4.19) belongs
 * to notification, so notification declares the abstraction and identity —
 * which owns memberships — supplies it. Nothing in notification/ imports
 * identity's infrastructure. Same inversion as `ActorWorkloadPort`.
 */
export interface WorkspaceAudiencePort {
  /** Live members only: a revoked member is not an audience. */
  membersOf(workspaceId: string): Promise<ActorRef[]>;
}
export const WORKSPACE_AUDIENCE = "notification/WorkspaceAudiencePort";
