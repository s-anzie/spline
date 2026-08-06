import { ActorRef } from "../../../identity/domain/actor";

/**
 * §18 — whether an actor can still act at all.
 *
 * Declared here because the runtime has one question it cannot answer on its
 * own: a machine record may only be used by the actor that registered it, and
 * that rule needs a release. Revocation is the release — an actor whose
 * credentials are all revoked operates nothing, which is precisely what
 * revoking them meant.
 *
 * Without it, a computer legitimately handed to another organization arrives
 * with a new identity, finds its own hostname held by its old one, and is
 * refused forever. That was not hypothetical: a real daemon retried every
 * five seconds against a 403 it could never satisfy.
 */
export interface ActorStanding {
  /** False when the actor holds no credential that has not been revoked. */
  holdsLiveCredential(actor: ActorRef): Promise<boolean>;
}

export const ACTOR_STANDING = "runtime/ActorStanding";
