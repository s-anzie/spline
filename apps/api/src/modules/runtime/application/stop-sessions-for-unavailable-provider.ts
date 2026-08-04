import { AgentSessionStatus } from "@repo/db";
import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { PrismaService } from "../../../prisma/prisma.service";
import { StopAgentSessionUseCase } from "./stop-agent-session.use-case";

@Injectable()
export class StopSessionsForUnavailableProvider {
  private readonly logger = new Logger(StopSessionsForUnavailableProvider.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stopSession: StopAgentSessionUseCase,
  ) {}

  @OnEvent("provider.availability_changed", { async: true })
  async handle(event: { provider: string; available: boolean }): Promise<void> {
    if (event.available) return;
    const sessions = await this.prisma.agentSession.findMany({
      where: {
        provider: event.provider,
        status: {
          in: [
            AgentSessionStatus.STARTING,
            AgentSessionStatus.RUNNING,
            AgentSessionStatus.AWAITING_APPROVAL,
          ],
        },
      },
      select: { id: true },
    });
    for (const session of sessions) {
      const result = await this.stopSession.execute({ sessionId: session.id });
      if (result.isFailure)
        this.logger.warn(`Unable to stop session ${session.id}: ${result.error.message}`);
    }
  }
}
