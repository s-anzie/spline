import { WorkspaceRole } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { AssignWorkspaceRoleUseCase } from "../../identity/application/assign-workspace-role.use-case";
import { InMemoryAgentCredentialRepository } from "../../identity/application/testing/in-memory-agent-credential.repository";
import { InMemoryWorkspaceMembershipRepository } from "../../identity/application/testing/in-memory-workspace-membership.repository";
import { FakePasswordHasher } from "../../identity/application/testing/fake-password-hasher";
import { IssueAgentTokenUseCase } from "../../identity/application/issue-agent-token.use-case";
import { AGENT_TOKEN_PREFIX } from "../../identity/application/agent-token-format";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/in-memory-workspace.repository";
import { Workspace } from "../../workspace/domain/workspace";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { InvalidAgentWorkspaceRoleError } from "./agent-application.errors";
import { RegisterAgentUseCase } from "./register-agent.use-case";
import { InMemoryAgentRepository } from "./testing/in-memory-agent.repository";

function setup() {
  const agents = new InMemoryAgentRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const memberships = new InMemoryWorkspaceMembershipRepository();
  const eventPublisher = new FakeEventPublisher();
  const issueAgentToken = new IssueAgentTokenUseCase(
    new InMemoryAgentCredentialRepository(),
    new FakePasswordHasher(),
  );
  const assignWorkspaceRole = new AssignWorkspaceRoleUseCase(memberships);
  const useCase = new RegisterAgentUseCase(
    agents,
    new GetWorkspaceUseCase(workspaces),
    issueAgentToken,
    assignWorkspaceRole,
    eventPublisher,
  );
  return { agents, workspaces, memberships, eventPublisher, useCase };
}

describe("RegisterAgentUseCase", () => {
  it("registers an agent in an existing workspace and issues a token", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      provider: "claude",
      displayName: "Claude worker #1",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.agent.workspaceId).toBe(workspace.id.toString());
    expect(result.value.plainTextToken.startsWith(AGENT_TOKEN_PREFIX)).toBe(true);
  });

  it("publishes AgentRegistered", async () => {
    const { workspaces, eventPublisher, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    await useCase.execute({
      workspaceId: workspace.id.toString(),
      provider: "claude",
      displayName: "Claude worker #1",
    });

    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["agent.registered"]);
  });

  it("fails when the workspace does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({
      workspaceId: "unknown",
      provider: "claude",
      displayName: "Claude worker #1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("grants the agent an AGENT_CONTRIBUTOR membership by default", async () => {
    const { workspaces, memberships, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      provider: "claude",
      displayName: "Claude worker #1",
    });

    const membership = await memberships.findByActor(
      workspace.id.toString(),
      "AGENT",
      result.value.agent.id.toString(),
    );
    expect(membership?.role).toBe(WorkspaceRole.AGENT_CONTRIBUTOR);
  });

  it("grants a caller-chosen agent role", async () => {
    const { workspaces, memberships, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      provider: "claude",
      displayName: "Claude worker #1",
      role: WorkspaceRole.READ_ONLY_AGENT,
    });

    const membership = await memberships.findByActor(
      workspace.id.toString(),
      "AGENT",
      result.value.agent.id.toString(),
    );
    expect(membership?.role).toBe(WorkspaceRole.READ_ONLY_AGENT);
  });

  it("rejects a non-agent role (e.g. OWNER)", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      provider: "claude",
      displayName: "Claude worker #1",
      role: WorkspaceRole.OWNER,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidAgentWorkspaceRoleError);
  });
});
