import { AgentSessionStatus, ApprovalState } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { AgentSession } from "../domain/agent-session";
import { AgentSessionNotFoundError } from "./runtime-application.errors";
import { ApproveAgentSessionUseCase } from "./approve-agent-session.use-case";
import { InMemoryAgentSessionRepository } from "./testing/in-memory-agent-session.repository";

function awaitingApprovalSession() {
  const session = AgentSession.start({ agentId: "agent-1", provider: "claude", workspaceId: "w1", machineId: "m1" });
  session.changeStatus(AgentSessionStatus.RUNNING);
  session.changeStatus(AgentSessionStatus.AWAITING_APPROVAL);
  return session;
}

describe("ApproveAgentSessionUseCase", () => {
  it("approves and resumes the session", async () => {
    const sessions = new InMemoryAgentSessionRepository();
    const session = awaitingApprovalSession();
    await sessions.save(session);
    const useCase = new ApproveAgentSessionUseCase(sessions, new FakeEventPublisher());

    const result = await useCase.execute({ sessionId: session.id.toString() });

    expect(result.isSuccess).toBe(true);
    expect(result.value.approvalState).toBe(ApprovalState.APPROVED);
    expect(result.value.status).toBe(AgentSessionStatus.RUNNING);
  });

  it("fails when the session does not exist", async () => {
    const useCase = new ApproveAgentSessionUseCase(new InMemoryAgentSessionRepository(), new FakeEventPublisher());

    const result = await useCase.execute({ sessionId: "unknown" });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(AgentSessionNotFoundError);
  });
});
