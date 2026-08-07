import { Global, Inject, Injectable, Module } from "@nestjs/common";

import {
  ACTOR_STANDING,
  ActorStanding,
} from "../../runtime/domain/ports/actor-standing.port";
import {
  ORGANIZATION_FLEET,
  OrganizationFleet,
} from "../../runtime/domain/ports/organization-fleet.port";
import { ActorRef } from "../domain/actor";
import {
  ORGANISING_ACTOR,
  OrganisingActor,
} from "../../runtime/domain/ports/dispatch.port";
import { PermissionsService } from "../application/permissions.service";
import {
  ACTOR_CREDENTIAL_REPOSITORY,
  ActorCredentialRepository,
  USER_REPOSITORY,
  UserRepository,
} from "../domain/ports/identity.repository.ports";
import { IdentityModule } from "../identity.module";

/**
 * §18.2 — the credential set IS the registry of non-human actors, so it is
 * also the answer to "which machines does this organization own?".
 *
 * Revoked credentials are included on purpose: a machine whose credential was
 * revoked still exists, still appears in the record of what it ran, and an
 * operator looking at their fleet should see it rather than wonder where it
 * went. Whether it can still act is a question for the guard, not for a list.
 */
@Injectable()
export class OrganizationFleetAdapter implements OrganizationFleet {
  constructor(
    @Inject(ACTOR_CREDENTIAL_REPOSITORY)
    private readonly credentials: ActorCredentialRepository,
  ) {}

  async machineActorIdsOf(organizationId: string): Promise<string[]> {
    const held = await this.credentials.listByOrganization(organizationId);
    return [
      ...new Set(
        held
          .filter((credential) => credential.actor.type === "WORKER")
          .map((credential) => credential.actor.actorId),
      ),
    ];
  }
}

/**
 * §18 — the same registry, asked the other question: does this actor still
 * hold anything that works?
 *
 * Revoked ones do not count here, and that is the whole difference from the
 * adapter above: listing a fleet must show a machine whose credential was
 * revoked, because it still exists and still acted. Deciding whether it may
 * still act must not.
 *
 * A PERSON is answered differently, and getting that wrong opened a hole the
 * suite caught within the hour. Humans authenticate with a password and hold
 * no `ActorCredential` at all — the registry is for agents, workers and
 * services, whose existence IS a credential. Asking the credential set about
 * a person therefore answers "holds nothing", which would have declared every
 * machine an operator registered by hand to be free for the taking. A person
 * stands as long as their account does.
 */
@Injectable()
export class ActorStandingAdapter implements ActorStanding {
  constructor(
    @Inject(ACTOR_CREDENTIAL_REPOSITORY)
    private readonly credentials: ActorCredentialRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async holdsLiveCredential(actor: ActorRef): Promise<boolean> {
    if (actor.type === "HUMAN") {
      return (await this.users.findById(actor.actorId)) !== null;
    }
    const held = await this.credentials.listByActor(actor);
    return held.some((credential) => !credential.isRevoked);
  }
}

/**
 * §4.6 — a manager organises; everybody else does the work.
 *
 * `manage_tasks` is the question, not the role name: a role added later that
 * carries it gets the manager's briefing without anybody remembering to add
 * a branch here, and one that loses it stops getting it. The permission is
 * the fact; the role is how it is held.
 */
@Injectable()
export class OrganisingActorAdapter implements OrganisingActor {
  constructor(private readonly permissions: PermissionsService) {}

  async organises(actor: ActorRef, workspaceId: string): Promise<boolean> {
    return this.permissions.can(
      { actorType: actor.type, actorId: actor.actorId },
      "manage_tasks",
      workspaceId,
    );
  }

  /**
   * §10.9, §18.3 — the same question the bridge asks before serving the
   * judging verbs, asked of the same authority.
   *
   * No agent role holds this in the matrix, so the answer is false unless a
   * workspace's owner has lent it — and asking `can` rather than reading a
   * setting is what makes the briefing and the tools agree by construction
   * instead of by two people remembering.
   */
  async judges(actor: ActorRef, workspaceId: string): Promise<boolean> {
    return this.permissions.can(
      { actorType: actor.type, actorId: actor.actorId },
      "approve_validation",
      workspaceId,
    );
  }
}

/** Global, and importing IdentityModule: see the note in kernel/doc.md. */
@Global()
@Module({
  imports: [IdentityModule],
  providers: [
    OrganizationFleetAdapter,
    { provide: ORGANIZATION_FLEET, useExisting: OrganizationFleetAdapter },
    ActorStandingAdapter,
    { provide: ACTOR_STANDING, useExisting: ActorStandingAdapter },
    OrganisingActorAdapter,
    { provide: ORGANISING_ACTOR, useExisting: OrganisingActorAdapter },
  ],
  exports: [ORGANIZATION_FLEET, ACTOR_STANDING, ORGANISING_ACTOR],
})
export class OrganizationFleetModule {}
