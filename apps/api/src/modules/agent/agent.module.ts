import { Inject, Module, OnModuleInit } from "@nestjs/common";

import { WorkspaceModule } from "../workspace/workspace.module";
import { BackfillAgentPromptProfilesUseCase } from "./application/backfill-agent-prompt-profiles.use-case";
import { DisableAgentUseCase } from "./application/disable-agent.use-case";
import { EnableAgentUseCase } from "./application/enable-agent.use-case";
import { ForceAgentOfflineUseCase } from "./application/force-agent-offline.use-case";
import { GetAgentUseCase } from "./application/get-agent.use-case";
import { ListAgentsByWorkspaceUseCase } from "./application/list-agents-by-workspace.use-case";
import { ListProviderProfilesUseCase } from "./application/list-provider-profiles.use-case";
import { ManageAgentCredentialUseCase } from "./application/manage-agent-credential.use-case";
import { RegisterAgentUseCase } from "./application/register-agent.use-case";
import { UpdateAgentDetailsUseCase } from "./application/update-agent-details.use-case";
import { UpdateAgentHealthUseCase } from "./application/update-agent-health.use-case";
import { UpdateAgentPresenceUseCase } from "./application/update-agent-presence.use-case";
import { AGENT_REPOSITORY } from "./domain/ports/agent.repository.port";
import {
  PROVIDER_PROFILE_REPOSITORY,
  ProviderProfileRepository,
} from "./domain/ports/provider-profile.repository.port";
import { ProviderProfile } from "./domain/provider-profile";
import { PrismaAgentRepository } from "./infrastructure/prisma-agent.repository";
import { PrismaProviderProfileRepository } from "./infrastructure/prisma-provider-profile.repository";
import { AgentController } from "./interface/agent.controller";
import { ProviderProfileController } from "./interface/provider-profile.controller";

const DEFAULT_PROVIDERS = ["claude", "codex"];

@Module({
  imports: [WorkspaceModule],
  controllers: [AgentController, ProviderProfileController],
  providers: [
    RegisterAgentUseCase,
    BackfillAgentPromptProfilesUseCase,
    GetAgentUseCase,
    ListAgentsByWorkspaceUseCase,
    UpdateAgentDetailsUseCase,
    UpdateAgentHealthUseCase,
    UpdateAgentPresenceUseCase,
    ForceAgentOfflineUseCase,
    ListProviderProfilesUseCase,
    ManageAgentCredentialUseCase,
    DisableAgentUseCase,
    EnableAgentUseCase,
    { provide: AGENT_REPOSITORY, useClass: PrismaAgentRepository },
    {
      provide: PROVIDER_PROFILE_REPOSITORY,
      useClass: PrismaProviderProfileRepository,
    },
  ],
  exports: [
    UpdateAgentPresenceUseCase,
    GetAgentUseCase,
    ListAgentsByWorkspaceUseCase,
  ],
})
export class AgentModule implements OnModuleInit {
  constructor(
    @Inject(PROVIDER_PROFILE_REPOSITORY)
    private readonly providerProfiles: ProviderProfileRepository,
  ) {}

  /** Idempotent: seeds the global provider catalog once, on every boot. */
  async onModuleInit(): Promise<void> {
    for (const provider of DEFAULT_PROVIDERS) {
      const existing = await this.providerProfiles.findByProvider(provider);
      if (!existing) {
        await this.providerProfiles.save(ProviderProfile.create({ provider }));
      }
    }
  }
}
