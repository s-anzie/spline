import { randomUUID } from "node:crypto";

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { IssueActorCredentialUseCase } from "../application/issue-actor-credential.use-case";
import { RevokeActorCredentialUseCase } from "../application/revoke-actor-credential.use-case";
import { ActorIdentity } from "../application/permissions.service";
import { ActorType } from "../domain/actor";
import {
  ACTOR_CREDENTIAL_REPOSITORY,
  ActorCredentialRepository,
  ORGANIZATION_REPOSITORY,
  OrganizationRepository,
} from "../domain/ports/identity.repository.ports";
import { ActorAuthGuard } from "./actor-auth.guard";
import { CurrentActor } from "./current-actor.decorator";

/**
 * A person is registered, never issued: they choose their own password and
 * nobody else may mint an identity that acts as them. Everything else in this
 * system is a thing an operator brings into being on purpose.
 */
const ISSUABLE = ["AGENT", "SERVICE"] as const;
type IssuableActorType = (typeof ISSUABLE)[number];

export class CreateActorDto {
  @IsIn(ISSUABLE)
  actorType!: IssuableActorType;

  /** What an operator calls it. The registry has no other name for it. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  displayName!: string;
}

export class ListActorsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

interface ActorView {
  credentialId: string;
  actorType: string;
  actorId: string;
  displayName: string;
  revoked: boolean;
  createdAt: string;
  /**
   * The one column that makes this list worth reading: an identity nothing
   * has ever authenticated with is either brand new or forgotten.
   */
  lastUsedAt: string | null;
}

/**
 * §18.2 — the registry of an organization's non-human actors.
 *
 * `ActorCredential` IS that registry: v3 has no Agent entity, so an agent
 * exists precisely because somebody issued it a credential and gave it a
 * name. Until this controller existed the use case behind it was reachable
 * from exactly one place — machine pairing, which mints a WORKER — so an
 * AGENT could not be brought into existence at all, and a workspace could
 * only ever assign work to a person.
 *
 * Organizations carry no permission matrix (`PermissionsGuard` needs a
 * `:workspaceId` and there is none here), so ownership is checked by hand,
 * the same way `OrganizationController` and enrolment decisions do it.
 */
@Controller("organizations/:organizationId/actors")
@UseGuards(ActorAuthGuard)
export class ActorRegistryController {
  constructor(
    private readonly issue: IssueActorCredentialUseCase,
    private readonly revokeCredential: RevokeActorCredentialUseCase,
    @Inject(ACTOR_CREDENTIAL_REPOSITORY)
    private readonly credentials: ActorCredentialRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
  ) {}

  /**
   * The actor's id is minted here rather than accepted from the caller.
   * Letting a client name it would let one organization issue a credential
   * that acts as another's agent — the same identifier, a different owner.
   */
  @Post()
  async create(
    @CurrentActor() actor: ActorIdentity,
    @Param("organizationId") organizationId: string,
    @Body() dto: CreateActorDto,
  ): Promise<{ actorId: string; credentialId: string; token: string }> {
    await this.requireOwner(actor, organizationId);

    const actorId = randomUUID();
    const result = await this.issue.execute({
      actorType: dto.actorType as Exclude<ActorType, "HUMAN">,
      actorId,
      organizationId,
      displayName: dto.displayName,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    // The token is returned once and never stored in the clear. A client that
    // does not keep it has to issue a new credential — which is the correct
    // outcome, and cheaper than a route that could hand it out twice.
    return { actorId, ...result.value };
  }

  @Get()
  async list(
    @CurrentActor() actor: ActorIdentity,
    @Param("organizationId") organizationId: string,
    @Query() query: ListActorsQueryDto,
  ): Promise<ActorView[]> {
    await this.requireOwner(actor, organizationId);
    const credentials = await this.credentials.listByOrganization(
      organizationId,
      query.limit,
    );
    return credentials.map((credential) => ({
      credentialId: credential.id.value,
      actorType: credential.actor.type,
      actorId: credential.actor.actorId,
      displayName: credential.displayName,
      // §17.8 — a revoked identity is shown as revoked, never hidden: it
      // still acted, and its history has to stay reachable.
      revoked: credential.isRevoked,
      createdAt: credential.createdAt.toISOString(),
      lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
    }));
  }

  @Post(":credentialId/revoke")
  @HttpCode(200)
  async revoke(
    @CurrentActor() actor: ActorIdentity,
    @Param("organizationId") organizationId: string,
    @Param("credentialId") credentialId: string,
  ): Promise<{ ok: true }> {
    await this.requireOwner(actor, organizationId);

    const credential = await this.credentials.findById(credentialId);
    if (!credential || credential.organizationId !== organizationId) {
      throw new NotFoundException(`Credential "${credentialId}" was not found`);
    }

    const result = await this.revokeCredential.execute({ credentialId, organizationId });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return { ok: true };
  }

  private async requireOwner(
    actor: ActorIdentity,
    organizationId: string,
  ): Promise<void> {
    const organization = await this.organizations.findById(organizationId);
    if (!organization) {
      throw new NotFoundException(`Organization "${organizationId}" was not found`);
    }
    if (actor.actorType !== "HUMAN" || organization.ownerId !== actor.actorId) {
      throw new ForbiddenException(
        "Only this organization's owner can issue or revoke its actors",
      );
    }
  }
}
