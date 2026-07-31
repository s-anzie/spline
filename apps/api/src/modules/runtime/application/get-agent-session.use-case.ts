import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { AgentSession } from "../domain/agent-session";
import {
  AGENT_SESSION_REPOSITORY,
  AgentSessionRepository,
} from "../domain/ports/agent-session.repository.port";
import { AgentSessionNotFoundError } from "./runtime-application.errors";

@Injectable()
export class GetAgentSessionUseCase {
  constructor(@Inject(AGENT_SESSION_REPOSITORY) private readonly sessions: AgentSessionRepository) {}

  async execute(sessionId: string): Promise<Result<AgentSession, AgentSessionNotFoundError>> {
    const session = await this.sessions.findById(UniqueEntityId.create(sessionId));
    if (!session) {
      return Result.fail(new AgentSessionNotFoundError(sessionId));
    }
    return Result.ok(session);
  }
}
