import { Controller, Get, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../../identity/interface";
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
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

/**
 * Global, unscoped catalog — not workspace-scoped, so it can't sit behind
 * PermissionsGuard (which requires a :workspaceId route param). Any
 * authenticated human or agent can read it.
 */
@Controller("provider-profiles")
@UseGuards(JwtAuthGuard)
export class ProviderProfileController {
  constructor(private readonly listProviderProfilesUseCase: ListProviderProfilesUseCase) {}

  @Get()
  async list() {
    const profiles = await this.listProviderProfilesUseCase.execute();
    return profiles.map(toProviderProfileResponse);
  }
}
