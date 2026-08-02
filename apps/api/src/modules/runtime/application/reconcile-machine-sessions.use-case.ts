import { AgentSessionStatus } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import {
  AGENT_SESSION_REPOSITORY,
  AgentSessionRepository,
} from "../domain/ports/agent-session.repository.port";

@Injectable()
export class ReconcileMachineSessionsUseCase {
  constructor(
    @Inject(AGENT_SESSION_REPOSITORY)
    private readonly sessions: AgentSessionRepository,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  async execute(machineId: string, runningSessionIds: string[]): Promise<void> {
    const reported = new Set(runningSessionIds);
    const active = await this.sessions.listActiveByMachine(machineId);
    for (const session of active) {
      if (
        session.status === AgentSessionStatus.STARTING ||
        reported.has(session.id.toString())
      )
        continue;
      session.changeStatus(AgentSessionStatus.CRASHED);
      await this.sessions.save(session);
      this.events.publishAll(session.domainEvents);
      session.clearEvents();
    }
  }
}
