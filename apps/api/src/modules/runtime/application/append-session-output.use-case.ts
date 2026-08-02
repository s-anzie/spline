import { SessionOutputStream } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  AGENT_SESSION_REPOSITORY,
  AgentSessionRepository,
} from "../domain/ports/agent-session.repository.port";
import { SessionOutputAppendedEvent } from "../domain/session-output-appended.event";
import { AgentSessionNotFoundError } from "./runtime-application.errors";

const MAX_CHUNK_LENGTH = 16_384;

@Injectable()
export class AppendSessionOutputUseCase {
  constructor(
    @Inject(AGENT_SESSION_REPOSITORY)
    private readonly sessions: AgentSessionRepository,
    private readonly prisma: PrismaService,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  async execute(input: {
    machineId: string;
    sessionId: string;
    sequence: number;
    stream: "stdout" | "stderr";
    content: string;
  }) {
    const session = await this.sessions.findById(
      UniqueEntityId.create(input.sessionId),
    );
    if (!session || session.machineId !== input.machineId)
      throw new AgentSessionNotFoundError(input.sessionId);
    if (!Number.isSafeInteger(input.sequence) || input.sequence < 0)
      throw new Error("Invalid session output sequence");
    if (!input.content || input.content.length > MAX_CHUNK_LENGTH)
      throw new Error("Invalid session output chunk length");

    const output = await this.prisma.agentSessionOutput.upsert({
      where: {
        sessionId_sequence: {
          sessionId: input.sessionId,
          sequence: input.sequence,
        },
      },
      create: {
        sessionId: input.sessionId,
        sequence: input.sequence,
        stream:
          input.stream === "stderr"
            ? SessionOutputStream.STDERR
            : SessionOutputStream.STDOUT,
        content: input.content,
      },
      update: {},
    });
    const response = {
      ...output,
      stream: output.stream as "STDOUT" | "STDERR",
      createdAt: output.createdAt.toISOString(),
    };
    this.events.publish(
      new SessionOutputAppendedEvent(session.workspaceId, response),
    );
    return response;
  }
}
