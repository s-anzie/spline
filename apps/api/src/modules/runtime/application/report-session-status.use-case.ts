import { AgentSessionStatus } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { AgentSession } from "../domain/agent-session";
import { InvalidAgentSessionStatusTransitionError } from "../domain/agent-session.errors";
import {
  AGENT_SESSION_REPOSITORY,
  AgentSessionRepository,
} from "../domain/ports/agent-session.repository.port";
import { AgentSessionNotFoundError } from "./runtime-application.errors";

export interface ReportSessionStatusInput {
  sessionId: string;
  status: AgentSessionStatus;
}

export type ReportSessionStatusError = AgentSessionNotFoundError | InvalidAgentSessionStatusTransitionError;

@Injectable()
export class ReportSessionStatusUseCase {
  constructor(
    @Inject(AGENT_SESSION_REPOSITORY) private readonly sessions: AgentSessionRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(
    input: ReportSessionStatusInput,
  ): Promise<Result<AgentSession, ReportSessionStatusError>> {
    const session = await this.sessions.findById(UniqueEntityId.create(input.sessionId));
    if (!session) {
      return Result.fail(new AgentSessionNotFoundError(input.sessionId));
    }

    try {
      session.changeStatus(input.status);
    } catch (error) {
      if (error instanceof InvalidAgentSessionStatusTransitionError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.sessions.save(session);
    this.eventPublisher.publishAll(session.domainEvents);
    session.clearEvents();

    return Result.ok(session);
  }
}
