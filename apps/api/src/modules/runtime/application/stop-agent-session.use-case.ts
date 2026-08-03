import { AgentSessionStatus, RuntimeCommandType } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { AgentSession } from "../domain/agent-session";
import { InvalidAgentSessionStatusTransitionError } from "../domain/agent-session.errors";
import {
  AGENT_SESSION_REPOSITORY,
  AgentSessionRepository,
} from "../domain/ports/agent-session.repository.port";
import { RUNTIME_COMMAND_REPOSITORY, RuntimeCommandRepository } from "../domain/ports/runtime-command.repository.port";
import { RuntimeCommand } from "../domain/runtime-command";
import { AgentSessionNotFoundError } from "./runtime-application.errors";

export interface StopAgentSessionInput {
  sessionId: string;
}

export type StopAgentSessionError = AgentSessionNotFoundError | InvalidAgentSessionStatusTransitionError;

@Injectable()
export class StopAgentSessionUseCase {
  constructor(
    @Inject(AGENT_SESSION_REPOSITORY) private readonly sessions: AgentSessionRepository,
    @Inject(RUNTIME_COMMAND_REPOSITORY) private readonly commands: RuntimeCommandRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: StopAgentSessionInput): Promise<Result<AgentSession, StopAgentSessionError>> {
    const session = await this.sessions.findById(UniqueEntityId.create(input.sessionId));
    if (!session) {
      return Result.fail(new AgentSessionNotFoundError(input.sessionId));
    }

    const now = this.clock.now();
    try {
      session.changeStatus(AgentSessionStatus.STOPPED, now);
    } catch (error) {
      if (error instanceof InvalidAgentSessionStatusTransitionError) {
        return Result.fail(error);
      }
      throw error;
    }
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
