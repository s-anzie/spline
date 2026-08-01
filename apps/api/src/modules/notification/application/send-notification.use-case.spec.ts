import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { RegisterAgentUseCase } from "../../agent/application/register-agent.use-case";
import { InMemoryAgentRepository } from "../../agent/application/testing/in-memory-agent.repository";
import { ListAgentsByWorkspaceUseCase } from "../../agent/application/list-agents-by-workspace.use-case";
import { InMemoryWorkspaceMembershipRepository } from "../../identity/application/testing/in-memory-workspace-membership.repository";
import { AssignWorkspaceRoleUseCase } from "../../identity/application/assign-workspace-role.use-case";
import { IssueAgentTokenUseCase } from "../../identity/application/issue-agent-token.use-case";
import { InMemoryAgentCredentialRepository } from "../../identity/application/testing/in-memory-agent-credential.repository";
import { FakePasswordHasher } from "../../identity/application/testing/fake-password-hasher";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/in-memory-workspace.repository";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { Workspace } from "../../workspace/domain/workspace";
import { EmptyNotificationBodyError } from "../domain/notification.errors";
import { EmptyDirectRecipientsError } from "./notification-application.errors";
import { InMemoryNotificationRecipientRepository } from "./testing/in-memory-notification-recipient.repository";
import { InMemoryNotificationRepository } from "./testing/in-memory-notification.repository";
import { SendNotificationUseCase } from "./send-notification.use-case";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const NOW = new Date("2026-07-31T10:00:00Z");

async function setup() {
  const notifications = new InMemoryNotificationRepository();
  const recipients = new InMemoryNotificationRecipientRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const agents = new InMemoryAgentRepository();
  const memberships = new InMemoryWorkspaceMembershipRepository();
  const agentCredentials = new InMemoryAgentCredentialRepository();
  const clock = new FakeClock(NOW);
  const eventPublisher = new FakeEventPublisher();

  const workspace = Workspace.create({ name: "My Project" });
  await workspaces.save(workspace);

  const registerAgent = new RegisterAgentUseCase(
    agents,
    new GetWorkspaceUseCase(workspaces),
    new IssueAgentTokenUseCase(agentCredentials, new FakePasswordHasher()),
    new AssignWorkspaceRoleUseCase(memberships),
    eventPublisher,
  );

  const useCase = new SendNotificationUseCase(
    notifications,
    recipients,
    new GetWorkspaceUseCase(workspaces),
    new ListAgentsByWorkspaceUseCase(agents),
    clock,
    eventPublisher,
  );

  return { workspace, notifications, recipients, registerAgent, eventPublisher, useCase };
}

describe("SendNotificationUseCase", () => {
  it("sends a DIRECT notification to the explicitly given recipients", async () => {
    const { workspace, recipients, eventPublisher, useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      kind: "CHAT_MESSAGE",
      scope: "DIRECT",
      body: "Hey, starting the dev server",
      createdBy: HUMAN_1,
      recipients: [{ type: "AGENT", id: "agent-1" }],
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.notification.body).toBe("Hey, starting the dev server");
    expect(result.value.recipients).toHaveLength(1);
    expect(result.value.recipients[0]?.recipientId).toBe("agent-1");
    expect(result.value.recipients[0]?.deliveryStatus).toBe("PENDING");

    const persisted = await recipients.listByNotification(result.value.notification.id.toString());
    expect(persisted).toHaveLength(1);
    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["notification.sent"]);
  });

  it("fails a DIRECT notification with no recipients", async () => {
    const { workspace, useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      kind: "CHAT_MESSAGE",
      scope: "DIRECT",
      body: "Hello",
      createdBy: HUMAN_1,
      recipients: [],
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyDirectRecipientsError);
  });

  it("resolves a BROADCAST notification to every agent currently in the workspace, immediately at creation", async () => {
    const { workspace, registerAgent, recipients, useCase } = await setup();
    const agent1Result = await registerAgent.execute({ workspaceId: workspace.id.toString(), provider: "claude", displayName: "Claude worker" });
    const agent2Result = await registerAgent.execute({ workspaceId: workspace.id.toString(), provider: "codex", displayName: "Codex worker" });
    if (agent1Result.isFailure || agent2Result.isFailure) {
      throw new Error("agent registration failed in test setup");
    }

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      kind: "SYSTEM_ALERT",
      scope: "BROADCAST",
      body: "Process crashed",
      createdBy: { type: "SYSTEM", id: "boot-reconciliation" },
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.recipients).toHaveLength(2);
    const ids = result.value.recipients.map((r) => r.recipientId).sort();
    expect(ids).toEqual([agent1Result.value.agent.id.toString(), agent2Result.value.agent.id.toString()].sort());

    const persisted = await recipients.listByNotification(result.value.notification.id.toString());
    expect(persisted).toHaveLength(2);
    expect(persisted.every((r) => r.deliveryStatus === "PENDING")).toBe(true);
  });

  it("fails when the workspace does not exist", async () => {
    const { useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: "unknown",
      kind: "CHAT_MESSAGE",
      scope: "DIRECT",
      body: "Hello",
      createdBy: HUMAN_1,
      recipients: [{ type: "AGENT", id: "agent-1" }],
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("fails on an empty body", async () => {
    const { workspace, useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      kind: "CHAT_MESSAGE",
      scope: "DIRECT",
      body: "   ",
      createdBy: HUMAN_1,
      recipients: [{ type: "AGENT", id: "agent-1" }],
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyNotificationBodyError);
  });
});
