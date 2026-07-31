import { AgentSessionStatus } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { AgentSession } from "../domain/agent-session";
import { InvalidAgentSessionStatusTransitionError } from "../domain/agent-session.errors";
import { AgentSessionNotFoundError } from "./runtime-application.errors";
import { ReportSessionStatusUseCase } from "./report-session-status.use-case";
import { InMemoryAgentSessionRepository } from "./testing/in-memory-agent-session.repository";

describe("ReportSessionStatusUseCase", () => {
  it("moves the session to the reported status and publishes the event", async () => {
    const sessions = new InMemoryAgentSessionRepository();
    const eventPublisher = new FakeEventPublisher();
    const session = AgentSession.start({ agentId: "agent-1", provider: "claude", workspaceId: "w1", machineId: "m1" });
    session.clearEvents();
    await sessions.save(session);
    const useCase = new ReportSessionStatusUseCase(sessions, eventPublisher);

    const result = await useCase.execute({ sessionId: session.id.toString(), status: AgentSessionStatus.RUNNING });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(AgentSessionStatus.RUNNING);
    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["agent_session.status_changed"]);
  });

  it("fails on an invalid transition", async () => {
    const sessions = new InMemoryAgentSessionRepository();
    const session = AgentSession.start({ agentId: "agent-1", provider: "claude", workspaceId: "w1", machineId: "m1" });
    await sessions.save(session);
    const useCase = new ReportSessionStatusUseCase(sessions, new FakeEventPublisher());

    const result = await useCase.execute({ sessionId: session.id.toString(), status: AgentSessionStatus.COMPLETED });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidAgentSessionStatusTransitionError);
  });

  it("fails when the session does not exist", async () => {
    const useCase = new ReportSessionStatusUseCase(new InMemoryAgentSessionRepository(), new FakeEventPublisher());

    const result = await useCase.execute({ sessionId: "unknown", status: AgentSessionStatus.RUNNING });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(AgentSessionNotFoundError);
  });
});
