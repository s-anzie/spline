import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { IsNotEmpty, IsString } from "class-validator";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";

import { ActorIdentity } from "../application/permissions.service";
import {
  ORGANIZATION_REPOSITORY,
  OrganizationRepository,
} from "../domain/ports/identity.repository.ports";
import { ActorAuthGuard } from "./actor-auth.guard";
import { CurrentActor } from "./current-actor.decorator";

export class RenameOrganizationDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

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
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
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

  /** Only the owner renames their organization. */
  @Patch(":organizationId")
  async rename(
    @CurrentActor() actor: ActorIdentity,
    @Param("organizationId") organizationId: string,
    @Body() dto: RenameOrganizationDto,
  ): Promise<{ ok: true }> {
    const organization = await this.organizations.findById(organizationId);
    if (!organization) {
      throw new NotFoundException(`Organization "${organizationId}" was not found`);
    }
    if (actor.actorType !== "HUMAN" || organization.ownerId !== actor.actorId) {
      throw new ForbiddenException("Only the owner can rename this organization");
    }

    const renamed = organization.rename(dto.name, this.clock.now());
    if (renamed.isFailure) {
      throw new BadRequestException(renamed.error.message);
    }
    await this.organizations.save(organization);
    await flushDomainEvents(organization, this.publisher);
    return { ok: true };
  }
}
