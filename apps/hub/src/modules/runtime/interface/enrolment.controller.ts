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
import { Throttle } from "@nestjs/throttler";

import { authThrottleLimit, throttleTtlMs } from "../../../config/hardening";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { ActorIdentity } from "../../identity/application/permissions.service";
import {
  ORGANIZATION_REPOSITORY,
  OrganizationRepository,
} from "../../identity/domain/ports/identity.repository.ports";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  ClaimEnrolmentUseCase,
  DecideEnrolmentUseCase,
  RequestEnrolmentUseCase,
} from "../application/enrolment.use-cases";
import {
  ENROLMENT_STORE,
  EnrolmentStore,
} from "../domain/ports/runtime.repository.port";
import {
  ClaimEnrolmentDto,
  DecideEnrolmentDto,
  ListQueryDto,
  RequestEnrolmentDto,
} from "./runtime.controller";

/**
 * Guessing a pairing code is guessing a secret, so these routes carry the
 * same ceiling as /auth/login. 40 bits of entropy inside a ten-minute window
 * is already out of reach; the limit is what makes "already" unconditional.
 */
const GUESSING_A_CODE = { default: { ttl: throttleTtlMs(), limit: authThrottleLimit() } };

/**
 * §6.3, §18.2 — the door a machine knocks on.
 *
 * DELIBERATELY UNAUTHENTICATED, and this is the one controller in the system
 * that is. A machine asking to be paired has nothing to authenticate with —
 * that is what pairing is for. What replaces authentication here:
 *
 * - the request grants nothing; it only creates a PENDING record
 * - a human must approve it, using a code printed on that machine's console
 * - the claim requires the deviceId the machine generated and kept
 * - both routes are rate-limited like a login
 *
 * The alternative was for an operator to mint a token in the hub and paste it
 * into the machine's configuration — which moves a long-lived secret through
 * a clipboard and a shell history, once per machine.
 */
@Controller("runtime/enrolments")
export class EnrolmentDoorController {
  constructor(
    private readonly requestEnrolment: RequestEnrolmentUseCase,
    private readonly claimEnrolment: ClaimEnrolmentUseCase,
  ) {}

  @Post()
  @Throttle(GUESSING_A_CODE)
  async request(@Body() dto: RequestEnrolmentDto) {
    const result = await this.requestEnrolment.execute(dto);
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
  }

  /**
   * The machine comes back for its credential. Answers 409 while it is still
   * waiting, so a worker can poll without treating "not yet" as a failure.
   */
  @Post(":enrolmentId/claim")
  @HttpCode(200)
  @Throttle(GUESSING_A_CODE)
  async claim(
    @Param("enrolmentId") enrolmentId: string,
    @Body() dto: ClaimEnrolmentDto,
  ) {
    const result = await this.claimEnrolment.execute({
      enrolmentId,
      deviceId: dto.deviceId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        conflicts: ["EnrolmentNotClaimableError"],
      });
    }
    return result.value;
  }
}

interface EnrolmentView {
  enrolmentId: string;
  hostname: string;
  architecture: string;
  operatingSystem: string;
  capabilities: readonly string[];
  labels: readonly string[];
  requestedAt: string;
  /** §17.8 — an expired request is shown as expired, never silently hidden. */
  expired: boolean;
}

/**
 * §6.3 — the operator's side. Approving is what binds a machine to an
 * organization, so only that organization's owner may.
 */
@Controller("organizations/:organizationId/enrolments")
@UseGuards(ActorAuthGuard)
export class EnrolmentDecisionController {
  constructor(
    private readonly decide: DecideEnrolmentUseCase,
    @Inject(ENROLMENT_STORE) private readonly enrolments: EnrolmentStore,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Pending requests are global, not per organization: a machine has not been
   * assigned to one yet, and cannot be until somebody approves it. What is
   * scoped is the DECISION — and the code is what proves the operator is
   * looking at the right machine, which is why the list never shows it.
   */
  @Get()
  async listPending(
    @CurrentActor() actor: ActorIdentity,
    @Param("organizationId") organizationId: string,
    @Query() query: ListQueryDto,
  ): Promise<EnrolmentView[]> {
    await this.requireOwner(actor, organizationId);
    const now = this.clock.now();
    return (await this.enrolments.listPending(query.limit)).map((enrolment) => ({
      enrolmentId: enrolment.id.value,
      hostname: enrolment.hostname,
      architecture: enrolment.architecture,
      operatingSystem: enrolment.operatingSystem,
      capabilities: enrolment.capabilities,
      labels: enrolment.labels,
      requestedAt: enrolment.requestedAt.toISOString(),
      expired: enrolment.hasExpiredAt(now),
    }));
  }

  @Post("decide")
  @HttpCode(200)
  async decideOne(
    @CurrentActor() actor: ActorIdentity,
    @Param("organizationId") organizationId: string,
    @Body() dto: DecideEnrolmentDto,
  ): Promise<{ hostname: string }> {
    await this.requireOwner(actor, organizationId);
    const result = await this.decide.execute({
      code: dto.code,
      organizationId,
      decidedBy: actor.actorId,
      approve: dto.approve ?? true,
    });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        conflicts: ["EnrolmentNotClaimableError"],
      });
    }
    return result.value;
  }

  /**
   * Organizations have no permission matrix — `PermissionsGuard` needs a
   * `:workspaceId` and there is none here — so ownership is checked by hand,
   * the same way `OrganizationController` does it.
   */
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
        "Only this organization's owner can pair a machine with it",
      );
    }
  }
}
