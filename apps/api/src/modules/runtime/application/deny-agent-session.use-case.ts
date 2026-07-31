import { AgentSessionStatus, ApprovalState, RuntimeCommandType } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { AgentSession } from "../domain/agent-session";
import {
  AGENT_SESSION_REPOSITORY,
  AgentSessionRepository,
} from "../domain/ports/agent-session.repository.port";
import { RUNTIME_COMMAND_REPOSITORY, RuntimeCommandRepository } from "../domain/ports/runtime-command.repository.port";
import { RuntimeCommand } from "../domain/runtime-command";
import { AgentSessionNotFoundError } from "./runtime-application.errors";

export interface DenyAgentSessionInput {
  sessionId: string;
}

@Injectable()
export class DenyAgentSessionUseCase {
  constructor(
    @Inject(AGENT_SESSION_REPOSITORY) private readonly sessions: AgentSessionRepository,
    @Inject(RUNTIME_COMMAND_REPOSITORY) private readonly commands: RuntimeCommandRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(
    input: DenyAgentSessionInput,
  ): Promise<Result<AgentSession, AgentSessionNotFoundError>> {
    const session = await this.sessions.findById(UniqueEntityId.create(input.sessionId));
    if (!session) {
      return Result.fail(new AgentSessionNotFoundError(input.sessionId));
    }

    const now = this.clock.now();
    session.setApprovalState(ApprovalState.DENIED, now);
    session.changeStatus(AgentSessionStatus.STOPPED, now);
    await this.sessions.save(session);

    await this.commands.save(
      RuntimeCommand.enqueue(
        {
          machineId: session.machineId,
          workspaceId: session.workspaceId,
          type: RuntimeCommandType.STOP_SESSION,
          payload: { sessionId: session.id.toString(), agentId: session.agentId },
        },
        now,
      ),
    );

    this.eventPublisher.publishAll(session.domainEvents);
    session.clearEvents();

    return Result.ok(session);
  }
}
