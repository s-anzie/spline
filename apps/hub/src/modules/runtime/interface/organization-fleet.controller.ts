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
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  ORGANIZATION_REPOSITORY,
  OrganizationRepository,
} from "../../identity/domain/ports/identity.repository.ports";
import {
  ORGANIZATION_FLEET,
  OrganizationFleet,
} from "../domain/ports/organization-fleet.port";
import { WORKER_STORE, WorkerStore } from "../domain/ports/runtime.repository.port";

export class ListFleetQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

interface FleetView {
  id: string;
  hostname: string;
  architecture: string;
  operatingSystem: string;
  capabilities: string[];
  labels: string[];
  status: string;
  lastHeartbeatAt: string | null;
  /** §17.8 — never a bare count: which workspaces it serves, named. */
  serves: string[];
}

/**
 * §6.3 vs §6.10 — the other half of "a workspace only sees what serves it".
 *
 * That rule is right, and on its own it strands an operator: a brand-new
 * workspace lists no machine and offers no way to get one, so the only thing
 * left to try is pairing again — which the hub refuses, correctly, because
 * the machine is already paired. Approving an enrolment binds a machine to an
 * ORGANIZATION; serving a workspace is a second, deliberate act. This is the
 * list that makes the second act possible.
 *
 * Organizations carry no permission matrix (`PermissionsGuard` needs a
 * `:workspaceId`), so ownership is checked by hand, as the enrolment
 * decisions and the actor registry already do.
 */
@Controller("organizations/:organizationId/workers")
@UseGuards(ActorAuthGuard)
export class OrganizationFleetController {
  constructor(
    @Inject(ORGANIZATION_FLEET) private readonly fleet: OrganizationFleet,
    @Inject(WORKER_STORE) private readonly workers: WorkerStore,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
  ) {}

  @Get()
  async list(
    @CurrentActor() actor: ActorIdentity,
    @Param("organizationId") organizationId: string,
    @Query() query: ListFleetQueryDto,
  ): Promise<FleetView[]> {
    const organization = await this.organizations.findById(organizationId);
    if (!organization) {
      throw new NotFoundException(`Organization "${organizationId}" was not found`);
    }
    if (actor.actorType !== "HUMAN" || organization.ownerId !== actor.actorId) {
      throw new ForbiddenException("Only this organization's owner can see its machines");
    }

    const actorIds = await this.fleet.machineActorIdsOf(organizationId);
    const machines = await this.workers.listRegisteredBy(actorIds, query.limit);
    return machines.map((machine) => ({
      id: machine.id.value,
      hostname: machine.hostname,
      architecture: machine.architecture,
      operatingSystem: machine.operatingSystem,
      capabilities: [...machine.capabilities],
      labels: [...machine.labels],
      status: machine.status,
      lastHeartbeatAt: machine.lastHeartbeatAt?.toISOString() ?? null,
      serves: [...machine.workspaceIds],
    }));
  }
}
