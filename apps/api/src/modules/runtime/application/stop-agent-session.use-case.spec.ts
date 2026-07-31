import { AgentSessionStatus, RuntimeCommandType } from "@repo/db";

import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { AgentSession } from "../domain/agent-session";
import { AgentSessionNotFoundError } from "./runtime-application.errors";
import { StopAgentSessionUseCase } from "./stop-agent-session.use-case";
import { InMemoryAgentSessionRepository } from "./testing/in-memory-agent-session.repository";
import { InMemoryRuntimeCommandRepository } from "./testing/in-memory-runtime-command.repository";

const NOW = new Date("2026-07-31T10:00:00Z");

describe("StopAgentSessionUseCase", () => {
  it("stops a running session and enqueues STOP_SESSION", async () => {
    const sessions = new InMemoryAgentSessionRepository();
    const commands = new InMemoryRuntimeCommandRepository();
    const session = AgentSession.start(
      { agentId: "agent-1", provider: "claude", workspaceId: "w1", machineId: "machine-1" },
      NOW,
    );
    session.changeStatus(AgentSessionStatus.RUNNING);
    await sessions.save(session);
    const useCase = new StopAgentSessionUseCase(sessions, commands, new FakeClock(NOW), new FakeEventPublisher());

    const result = await useCase.execute({ sessionId: session.id.toString() });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(AgentSessionStatus.STOPPED);

    const pending = await commands.listPendingByMachine("machine-1");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.type).toBe(RuntimeCommandType.STOP_SESSION);
  });

  it("fails when the session does not exist", async () => {
    const useCase = new StopAgentSessionUseCase(
      new InMemoryAgentSessionRepository(),
      new InMemoryRuntimeCommandRepository(),
      new FakeClock(NOW),
      new FakeEventPublisher(),
    );

    const result = await useCase.execute({ sessionId: "unknown" });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(AgentSessionNotFoundError);
  });
});
