import { ActorType, WorkspaceRole } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import {
  WORKSPACE_MEMBERSHIP_REPOSITORY,
  WorkspaceMembershipRepository,
} from "../../identity/domain/ports/workspace-membership.repository.port";
import { Agent } from "../domain/agent";
import {
  AGENT_REPOSITORY,
  AgentRepository,
} from "../domain/ports/agent.repository.port";
import { defaultAgentPromptProfile } from "./default-agent-prompt-profiles";

const SUPPORTED_ROLES = new Set<WorkspaceRole>([
  WorkspaceRole.AGENT_MANAGER,
  WorkspaceRole.AGENT_CONTRIBUTOR,
  WorkspaceRole.READ_ONLY_AGENT,
]);

@Injectable()
export class BackfillAgentPromptProfilesUseCase {
  constructor(
    @Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository,
    @Inject(WORKSPACE_MEMBERSHIP_REPOSITORY)
    private readonly memberships: WorkspaceMembershipRepository,
  ) {}

  async execute(workspaceId: string): Promise<Agent[]> {
    const agents = await this.agents.listByWorkspace(workspaceId);
    const updated: Agent[] = [];
    for (const agent of agents) {
      if (Object.keys(agent.promptProfile).length > 0) continue;
      const membership = await this.memberships.findByActor(
        workspaceId,
        ActorType.AGENT,
        agent.id.toString(),
      );
      if (!membership || !SUPPORTED_ROLES.has(membership.role)) continue;
      agent.updateDetails({
        promptProfile: defaultAgentPromptProfile(membership.role),
      });
      await this.agents.save(agent);
      updated.push(agent);
    }
    return updated;
  }
}
