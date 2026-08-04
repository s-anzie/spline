import { WorkspaceRole } from "@repo/db";

import { DomainError } from "../../../kernel/domain/domain-error";

export class AgentNotFoundError extends DomainError {
  constructor(agentId: string) {
    super("AGENT_NOT_FOUND", `Agent "${agentId}" was not found`);
  }
}

export class AgentNotEligibleError extends DomainError {
  constructor(agentId: string) {
    super("AGENT_NOT_ELIGIBLE", `Agent "${agentId}" is disabled and cannot be used`);
  }
}

export class AgentProviderUnavailableError extends DomainError {
  constructor(provider: string) {
    super(
      "AGENT_PROVIDER_UNAVAILABLE",
      `Provider "${provider}" is unavailable and cannot be assigned to an agent`,
    );
  }
}

export class InvalidAgentWorkspaceRoleError extends DomainError {
  constructor(role: WorkspaceRole) {
    super(
      "INVALID_AGENT_WORKSPACE_ROLE",
      `Role "${role}" cannot be assigned to an agent (must be AGENT_MANAGER, AGENT_CONTRIBUTOR, or READ_ONLY_AGENT)`,
    );
  }
}
