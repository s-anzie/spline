import { AgentSessionStatus } from "@repo/db";

import { DomainError } from "../../../kernel/domain/domain-error";

export class InvalidAgentSessionStatusTransitionError extends DomainError {
  constructor(from: AgentSessionStatus, to: AgentSessionStatus) {
    super(
      "INVALID_AGENT_SESSION_STATUS_TRANSITION",
      `Cannot move an agent session from "${from}" to "${to}"`,
    );
  }
}
