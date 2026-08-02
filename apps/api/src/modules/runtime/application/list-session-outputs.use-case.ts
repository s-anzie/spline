import { Inject, Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  AGENT_SESSION_REPOSITORY,
  AgentSessionRepository,
} from "../domain/ports/agent-session.repository.port";
import { AgentSessionNotFoundError } from "./runtime-application.errors";

@Injectable()
export class ListSessionOutputsUseCase {
  constructor(
    @Inject(AGENT_SESSION_REPOSITORY)
    private readonly sessions: AgentSessionRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(workspaceId: string, sessionId: string) {
    const session = await this.sessions.findById(
      UniqueEntityId.create(sessionId),
    );
    if (!session || session.workspaceId !== workspaceId)
      throw new AgentSessionNotFoundError(sessionId);
    const outputs = await this.prisma.agentSessionOutput.findMany({
      where: { sessionId },
      orderBy: { sequence: "asc" },
      take: 5_000,
    });
    return outputs.map((output) => ({
      ...output,
      createdAt: output.createdAt.toISOString(),
    }));
  }
}
