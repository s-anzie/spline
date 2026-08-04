import { ActorRef } from "../actor";

/**
 * The rule "you cannot remove someone who still owns live work" belongs to
 * identity, so identity declares the abstraction and whichever module owns
 * work supplies it. Nothing in identity/ imports task/.
 */
export interface ActorWorkloadPort {
  hasOpenWork(actor: ActorRef, workspaceId: string): Promise<boolean>;
}
export const ACTOR_WORKLOAD = "identity/ActorWorkloadPort";
