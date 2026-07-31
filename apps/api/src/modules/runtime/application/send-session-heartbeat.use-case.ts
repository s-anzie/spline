import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { AgentSession } from "../domain/agent-session";
import {
  AGENT_SESSION_REPOSITORY,
  AgentSessionRepository,
} from "../domain/ports/agent-session.repository.port";
import { AgentSessionNotFoundError } from "./runtime-application.errors";

export interface SendSessionHeartbeatInput {
  sessionId: string;
}

@Injectable()
export class SendSessionHeartbeatUseCase {
  constructor(@Inject(AGENT_SESSION_REPOSITORY) private readonly sessions: AgentSessionRepository) {}

  async execute(
    input: SendSessionHeartbeatInput,
    at: Date = new Date(),
  ): Promise<Result<AgentSession, AgentSessionNotFoundError>> {
    const session = await this.sessions.findById(UniqueEntityId.create(input.sessionId));
    if (!session) {
      return Result.fail(new AgentSessionNotFoundError(input.sessionId));
    }

    session.recordHeartbeat(at);
    await this.sessions.save(session);

    return Result.ok(session);
  }
}
