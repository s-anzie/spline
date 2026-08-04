import { ActorType } from "@repo/db";
import { Body, Controller, ForbiddenException, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { IsBoolean } from "class-validator";

import { AuthenticatedRequester, CurrentRequester, JwtAuthGuard } from "../../identity/interface";
import { UpdateProviderAvailabilityUseCase } from "../application/update-provider-availability.use-case";
import { ListProviderProfilesUseCase } from "../application/list-provider-profiles.use-case";
import { ProviderProfile } from "../domain/provider-profile";

function toProviderProfileResponse(profile: ProviderProfile) {
  return {
    id: profile.id.toString(),
    provider: profile.provider,
    capabilities: profile.capabilities,
    promptFormat: profile.promptFormat,
    approvalRules: profile.approvalRules,
    hookSupport: profile.hookSupport,
    sandboxModel: profile.sandboxModel,
    outputSchema: profile.outputSchema,
    available: profile.available,
    manuallyAvailable: profile.manuallyAvailable,
    quotaUnavailableUntil: profile.quotaUnavailableUntil?.toISOString() ?? null,
    quotaReason: profile.quotaReason,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

class ProviderAvailabilityDto {
  @IsBoolean()
  available!: boolean;
}

/**
 * Global, unscoped catalog — not workspace-scoped, so it can't sit behind
 * PermissionsGuard (which requires a :workspaceId route param). Any
 * authenticated human or agent can read it.
 */
@Controller("provider-profiles")
@UseGuards(JwtAuthGuard)
export class ProviderProfileController {
  constructor(
    private readonly listProviderProfilesUseCase: ListProviderProfilesUseCase,
    private readonly updateProviderAvailability: UpdateProviderAvailabilityUseCase,
  ) {}

  @Get()
  async list() {
    const profiles = await this.listProviderProfilesUseCase.execute();
    return profiles.map(toProviderProfileResponse);
  }

  @Patch(":provider/availability")
  async setAvailability(
    @Param("provider") provider: string,
    @Body() dto: ProviderAvailabilityDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    if (requester.type !== ActorType.HUMAN)
      throw new ForbiddenException("Only a human operator may change provider availability");
    const profile = await this.updateProviderAvailability.execute(provider, dto.available);
    return toProviderProfileResponse(profile);
  }
}
