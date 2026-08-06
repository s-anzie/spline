import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

import { ActorIdentity } from "../../identity/application/permissions.service";
import {
  ORGANIZATION_REPOSITORY,
  OrganizationRepository,
} from "../../identity/domain/ports/identity.repository.ports";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import { ListOrganizationActivityUseCase } from "../application/list-organization-activity.use-case";
import { EventView, toView } from "./event.controller";

export class ListActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

/**
 * §14 — the journal above every workspace.
 *
 * A machine asking to be paired, an identity issued or revoked, the
 * organization renamed: these are recorded with no workspace at all, because
 * they belong to none. Until this route they were written and never read —
 * the console could show a workspace's journal and nothing else, so the acts
 * that create the workspaces in the first place were invisible.
 *
 * Deliberately NOT a roll-up of the workspaces below (§4.2 has no exception),
 * and deliberately not "every workspace-less fact" either — see the use case.
 *
 * Organizations carry no permission matrix (`PermissionsGuard` needs a
 * `:workspaceId`), so ownership is checked by hand, as the fleet list and the
 * enrolment decisions already do.
 */
@Controller("organizations/:organizationId/events")
@UseGuards(ActorAuthGuard)
export class OrganizationActivityController {
  constructor(
    private readonly activity: ListOrganizationActivityUseCase,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
  ) {}

  @Get()
  async list(
    @CurrentActor() actor: ActorIdentity,
    @Param("organizationId") organizationId: string,
    @Query() query: ListActivityQueryDto,
  ): Promise<EventView[]> {
    const organization = await this.organizations.findById(organizationId);
    if (!organization) {
      throw new NotFoundException(`Organization "${organizationId}" was not found`);
    }
    if (actor.actorType !== "HUMAN" || organization.ownerId !== actor.actorId) {
      throw new ForbiddenException(
        "Only this organization's owner can read its activity",
      );
    }

    const result = await this.activity.execute({
      organizationId,
      ...(query.limit !== undefined && { limit: query.limit }),
    });
    return result.value.map(toView);
  }
}
