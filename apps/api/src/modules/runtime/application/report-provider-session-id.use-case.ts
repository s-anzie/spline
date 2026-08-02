import { Inject, Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import {
  AGENT_SESSION_REPOSITORY,
  AgentSessionRepository,
} from "../domain/ports/agent-session.repository.port";
import { AgentSessionNotFoundError } from "./runtime-application.errors";

@Injectable()
export class ReportProviderSessionIdUseCase {
  constructor(
    @Inject(AGENT_SESSION_REPOSITORY)
    private readonly sessions: AgentSessionRepository,
  ) {}

  async execute(input: {
    machineId: string;
    sessionId: string;
    providerSessionId: string;
  }): Promise<void> {
    const session = await this.sessions.findById(
      UniqueEntityId.create(input.sessionId),
    );
    if (!session || session.machineId !== input.machineId)
      throw new AgentSessionNotFoundError(input.sessionId);
    if (!input.providerSessionId.trim()) throw new Error("Invalid provider session id");
    session.assignProviderSessionId(input.providerSessionId.trim());
    await this.sessions.save(session);
  }
}
