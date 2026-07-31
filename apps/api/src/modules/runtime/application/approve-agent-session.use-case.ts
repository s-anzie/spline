import { AgentSessionStatus, ApprovalState } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { AgentSession } from "../domain/agent-session";
import {
  AGENT_SESSION_REPOSITORY,
  AgentSessionRepository,
} from "../domain/ports/agent-session.repository.port";
import { AgentSessionNotFoundError } from "./runtime-application.errors";

export interface ApproveAgentSessionInput {
  sessionId: string;
}

@Injectable()
export class ApproveAgentSessionUseCase {
  constructor(
    @Inject(AGENT_SESSION_REPOSITORY) private readonly sessions: AgentSessionRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(
    input: ApproveAgentSessionInput,
  ): Promise<Result<AgentSession, AgentSessionNotFoundError>> {
    const session = await this.sessions.findById(UniqueEntityId.create(input.sessionId));
    if (!session) {
      return Result.fail(new AgentSessionNotFoundError(input.sessionId));
    }

    session.setApprovalState(ApprovalState.APPROVED);
    session.changeStatus(AgentSessionStatus.RUNNING);
    await this.sessions.save(session);

    this.eventPublisher.publishAll(session.domainEvents);
    session.clearEvents();

    return Result.ok(session);
  }
}
