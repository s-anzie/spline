import { Inject, Injectable } from "@nestjs/common";

import { AgentSession } from "../domain/agent-session";
import {
  AGENT_SESSION_REPOSITORY,
  AgentSessionRepository,
} from "../domain/ports/agent-session.repository.port";

@Injectable()
export class ListAgentSessionsByWorkspaceUseCase {
  constructor(@Inject(AGENT_SESSION_REPOSITORY) private readonly sessions: AgentSessionRepository) {}

  async execute(workspaceId: string): Promise<AgentSession[]> {
    return this.sessions.listByWorkspace(workspaceId);
  }
}
