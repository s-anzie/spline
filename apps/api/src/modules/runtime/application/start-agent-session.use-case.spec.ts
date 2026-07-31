import { AgentSessionStatus, RuntimeCommandType } from "@repo/db";

import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { GetAgentUseCase } from "../../agent/application/get-agent.use-case";
import { InMemoryAgentRepository } from "../../agent/application/testing/in-memory-agent.repository";
import { Agent } from "../../agent/domain/agent";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/in-memory-workspace.repository";
import { Workspace } from "../../workspace/domain/workspace";
import { LocalMachine } from "../domain/local-machine";
import { StartAgentSessionUseCase } from "./start-agent-session.use-case";
import {
  AgentAlreadyHasActiveSessionError,
  MachineNotFoundError,
  MachineNotLinkedToWorkspaceError,
  WorkspaceRootPathNotConfiguredError,
} from "./runtime-application.errors";
import { InMemoryAgentSessionRepository } from "./testing/in-memory-agent-session.repository";
import { InMemoryLocalMachineRepository } from "./testing/in-memory-local-machine.repository";
import { InMemoryRuntimeCommandRepository } from "./testing/in-memory-runtime-command.repository";

const NOW = new Date("2026-07-31T10:00:00Z");

async function setup() {
  const agents = new InMemoryAgentRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const machines = new InMemoryLocalMachineRepository();
  const sessions = new InMemoryAgentSessionRepository();
  const commands = new InMemoryRuntimeCommandRepository();
  const clock = new FakeClock(NOW);
  const eventPublisher = new FakeEventPublisher();

  const workspace = Workspace.create({ name: "My Project" });
  workspace.setRootPath("/home/bradley/spline");
  await workspaces.save(workspace);

  const agent = Agent.create({ workspaceId: workspace.id.toString(), provider: "claude", displayName: "Worker" });
  await agents.save(agent);

  const machine = LocalMachine.register({ hostname: "bradley-dev", os: "linux" });
  machine.linkToWorkspace(workspace.id.toString());
  await machines.save(machine);

  const useCase = new StartAgentSessionUseCase(
    sessions,
    new GetWorkspaceUseCase(workspaces),
    new GetAgentUseCase(agents),
    machines,
    commands,
    clock,
    eventPublisher,
  );

  return { workspace, workspaces, agent, machine, machines, sessions, commands, useCase };
}

describe("StartAgentSessionUseCase", () => {
  it("starts a session and enqueues START_SESSION with the system prompt", async () => {
    const { workspace, agent, machine, commands, useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      agentId: agent.id.toString(),
      machineId: machine.id.toString(),
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(AgentSessionStatus.STARTING);
    expect(result.value.provider).toBe("claude");

    const pending = await commands.listPendingByMachine(machine.id.toString());
    expect(pending).toHaveLength(1);
    expect(pending[0]?.type).toBe(RuntimeCommandType.START_SESSION);
    const payload = pending[0]?.payload as { prompt: string; sessionId: string; cwd: string };
    expect(payload.prompt).toContain("claude");
    expect(payload.sessionId).toBe(result.value.id.toString());
    expect(payload.cwd).toBe("/home/bradley/spline");
  });

  it("fails when the workspace has no root path configured", async () => {
    const { workspaces, agent, machine, useCase } = await setup();
    const bareWorkspace = Workspace.create({ name: "No root" });
    await workspaces.save(bareWorkspace);

    const result = await useCase.execute({
      workspaceId: bareWorkspace.id.toString(),
      agentId: agent.id.toString(),
      machineId: machine.id.toString(),
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceRootPathNotConfiguredError);
  });

  it("fails when the machine does not exist", async () => {
    const { workspace, agent, useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      agentId: agent.id.toString(),
      machineId: "unknown",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(MachineNotFoundError);
  });

  it("fails when the machine is not linked to the workspace", async () => {
    const { workspace, agent, machines, useCase } = await setup();
    const unlinked = LocalMachine.register({ hostname: "other", os: "linux" });
    await machines.save(unlinked);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      agentId: agent.id.toString(),
      machineId: unlinked.id.toString(),
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(MachineNotLinkedToWorkspaceError);
  });

  it("fails when the agent already has an active session", async () => {
    const { workspace, agent, machine, useCase } = await setup();
    await useCase.execute({
      workspaceId: workspace.id.toString(),
      agentId: agent.id.toString(),
      machineId: machine.id.toString(),
    });

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      agentId: agent.id.toString(),
      machineId: machine.id.toString(),
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(AgentAlreadyHasActiveSessionError);
  });
});
