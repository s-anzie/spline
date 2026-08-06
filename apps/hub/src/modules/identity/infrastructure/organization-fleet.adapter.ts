import { Global, Inject, Injectable, Module } from "@nestjs/common";

import {
  ORGANIZATION_FLEET,
  OrganizationFleet,
} from "../../runtime/domain/ports/organization-fleet.port";
import {
  ACTOR_CREDENTIAL_REPOSITORY,
  ActorCredentialRepository,
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

/** Global, and importing IdentityModule: see the note in kernel/doc.md. */
@Global()
@Module({
  imports: [IdentityModule],
  providers: [
    OrganizationFleetAdapter,
    { provide: ORGANIZATION_FLEET, useExisting: OrganizationFleetAdapter },
  ],
  exports: [ORGANIZATION_FLEET],
})
export class OrganizationFleetModule {}
