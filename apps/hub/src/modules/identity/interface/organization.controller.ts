import { Controller, ForbiddenException, Get, Inject, UseGuards } from "@nestjs/common";

import { ActorIdentity } from "../application/permissions.service";
import {
  ORGANIZATION_REPOSITORY,
  OrganizationRepository,
} from "../domain/ports/identity.repository.ports";
import { ActorAuthGuard } from "./actor-auth.guard";
import { CurrentActor } from "./current-actor.decorator";

interface OrganizationView {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

/** Org → workspace navigation: the entry point of workspace creation. */
@Controller("organizations")
@UseGuards(ActorAuthGuard)
export class OrganizationController {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
  ) {}

  @Get()
  async listMine(@CurrentActor() actor: ActorIdentity): Promise<OrganizationView[]> {
    if (actor.actorType !== "HUMAN") {
      throw new ForbiddenException("Only humans own organizations");
    }
    const owned = await this.organizations.listByOwnerId(actor.actorId);
    return owned.map((organization) => ({
      id: organization.id.value,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt.toISOString(),
    }));
  }
}
