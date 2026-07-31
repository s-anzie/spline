import { ActorType, WorkspaceRole } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { AssignWorkspaceRoleUseCase } from "../../identity/application/assign-workspace-role.use-case";
import { IssueAgentTokenUseCase } from "../../identity/application/issue-agent-token.use-case";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { Agent } from "../domain/agent";
import { EmptyAgentDisplayNameError, EmptyAgentProviderError } from "../domain/agent.errors";
import { AGENT_REPOSITORY, AgentRepository } from "../domain/ports/agent.repository.port";
import { InvalidAgentWorkspaceRoleError } from "./agent-application.errors";

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
  | InvalidAgentWorkspaceRoleError;

@Injectable()
export class RegisterAgentUseCase {
  constructor(
    @Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository,
    private readonly getWorkspace: GetWorkspaceUseCase,
    private readonly issueAgentToken: IssueAgentTokenUseCase,
    private readonly assignWorkspaceRole: AssignWorkspaceRoleUseCase,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: RegisterAgentInput): Promise<Result<RegisterAgentOutput, RegisterAgentError>> {
    const workspaceResult = await this.getWorkspace.execute(input.workspaceId);
    if (workspaceResult.isFailure) {
      return Result.fail(workspaceResult.error);
    }

    const role = input.role ?? WorkspaceRole.AGENT_CONTRIBUTOR;
    if (!AGENT_ROLES.includes(role)) {
      return Result.fail(new InvalidAgentWorkspaceRoleError(role));
    }

    let agent: Agent;
    try {
      agent = Agent.create(input);
    } catch (error) {
      if (error instanceof EmptyAgentProviderError || error instanceof EmptyAgentDisplayNameError) {
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
    const { plainTextToken } = await this.issueAgentToken.execute(agent.id.toString());
    this.eventPublisher.publishAll(agent.domainEvents);
    agent.clearEvents();

    return Result.ok({ agent, plainTextToken });
  }
}
