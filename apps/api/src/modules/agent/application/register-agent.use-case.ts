import { ActorType, WorkspaceRole } from "@repo/db";
import { Inject, Injectable, Optional } from "@nestjs/common";

import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { AssignWorkspaceRoleUseCase } from "../../identity/application/assign-workspace-role.use-case";
import { IssueAgentTokenUseCase } from "../../identity/application/issue-agent-token.use-case";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { Agent } from "../domain/agent";
import {
  EmptyAgentDisplayNameError,
  EmptyAgentProviderError,
} from "../domain/agent.errors";
import {
  AGENT_REPOSITORY,
  AgentRepository,
} from "../domain/ports/agent.repository.port";
import { PROVIDER_PROFILE_REPOSITORY, ProviderProfileRepository } from "../domain/ports/provider-profile.repository.port";
import { AgentProviderUnavailableError, InvalidAgentWorkspaceRoleError } from "./agent-application.errors";
import { defaultAgentPromptProfile } from "./default-agent-prompt-profiles";

const AGENT_ROLES: WorkspaceRole[] = [
  WorkspaceRole.AGENT_MANAGER,
  WorkspaceRole.AGENT_CONTRIBUTOR,
  WorkspaceRole.READ_ONLY_AGENT,
];

export interface RegisterAgentInput {
  workspaceId: string;
  provider: string;
  displayName: string;
  capabilities?: string[];
  promptProfile?: Record<string, unknown>;
  permissions?: string[];
  role?: WorkspaceRole;
}

export interface RegisterAgentOutput {
  agent: Agent;
  plainTextToken: string;
}

export type RegisterAgentError =
  | WorkspaceNotFoundError
  | EmptyAgentProviderError
  | EmptyAgentDisplayNameError
  | InvalidAgentWorkspaceRoleError
  | AgentProviderUnavailableError;

@Injectable()
export class RegisterAgentUseCase {
  constructor(
    @Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository,
    private readonly getWorkspace: GetWorkspaceUseCase,
    private readonly issueAgentToken: IssueAgentTokenUseCase,
    private readonly assignWorkspaceRole: AssignWorkspaceRoleUseCase,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
    @Optional()
    @Inject(PROVIDER_PROFILE_REPOSITORY)
    private readonly providerProfiles?: ProviderProfileRepository,
  ) {}

  async execute(
    input: RegisterAgentInput,
  ): Promise<Result<RegisterAgentOutput, RegisterAgentError>> {
    const workspaceResult = await this.getWorkspace.execute(input.workspaceId);
    if (workspaceResult.isFailure) {
      return Result.fail(workspaceResult.error);
    }

    const role = input.role ?? WorkspaceRole.AGENT_CONTRIBUTOR;
    if (!AGENT_ROLES.includes(role)) {
      return Result.fail(new InvalidAgentWorkspaceRoleError(role));
    }
    const providerProfile = await this.providerProfiles?.findByProvider(input.provider);
    if (providerProfile?.available === false)
      return Result.fail(new AgentProviderUnavailableError(input.provider));

    let agent: Agent;
    try {
      agent = Agent.create({
        ...input,
        promptProfile: input.promptProfile ?? defaultAgentPromptProfile(role),
      });
    } catch (error) {
      if (
        error instanceof EmptyAgentProviderError ||
        error instanceof EmptyAgentDisplayNameError
      ) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.agents.save(agent);
    await this.assignWorkspaceRole.execute({
      workspaceId: input.workspaceId,
      actorType: ActorType.AGENT,
      actorId: agent.id.toString(),
      role,
    });
    const { plainTextToken } = await this.issueAgentToken.execute(
      agent.id.toString(),
    );
    this.eventPublisher.publishAll(agent.domainEvents);
    agent.clearEvents();

    return Result.ok({ agent, plainTextToken });
  }
}
