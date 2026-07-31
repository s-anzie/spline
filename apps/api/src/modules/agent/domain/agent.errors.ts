import { AgentStatus } from "@repo/db";

import { DomainError } from "../../../kernel/domain/domain-error";

export class EmptyAgentProviderError extends DomainError {
  constructor() {
    super("EMPTY_AGENT_PROVIDER", "Agent provider cannot be empty");
  }
}

export class EmptyAgentDisplayNameError extends DomainError {
  constructor() {
    super("EMPTY_AGENT_DISPLAY_NAME", "Agent display name cannot be empty");
  }
}

export class InvalidAgentStatusTransitionError extends DomainError {
  constructor(from: AgentStatus, to: AgentStatus) {
    super("INVALID_AGENT_STATUS_TRANSITION", `Cannot move an agent from "${from}" to "${to}"`);
  }
}
