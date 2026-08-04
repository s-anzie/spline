import { AgentSessionStatus, LocalMachineRuntimeStatus, RuntimeCommandStatus, RuntimeCommandType } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { FakeClock } from "../../../kernel/testing/fake-clock";
import { AgentSession } from "../domain/agent-session";
import { LocalMachine } from "../domain/local-machine";
import { RuntimeCommand } from "../domain/runtime-command";
import { GetRuntimeHealthUseCase } from "./get-runtime-health.use-case";
import { InMemoryAgentSessionRepository } from "./testing/in-memory-agent-session.repository";
import { InMemoryLocalMachineRepository } from "./testing/in-memory-local-machine.repository";
import { InMemoryRuntimeCommandRepository } from "./testing/in-memory-runtime-command.repository";

const NOW = new Date("2026-08-03T12:00:00Z");
const WORKSPACE_ID = "workspace-1";

function setup() {
  const machines = new InMemoryLocalMachineRepository();
  const sessions = new InMemoryAgentSessionRepository();
  const commands = new InMemoryRuntimeCommandRepository();
  const clock = new FakeClock(NOW);
  const useCase = new GetRuntimeHealthUseCase(machines, sessions, commands, clock);
  return { machines, sessions, commands, useCase };
}

describe("GetRuntimeHealthUseCase", () => {
  it("reports zeroed counts for a workspace with no runtime activity", async () => {
    const { useCase } = setup();

    const summary = await useCase.execute(WORKSPACE_ID);

    expect(summary).toEqual({
      machines: { total: 0, online: 0, stale: 0, offline: 0, staleDetails: [] },
      sessions: { active: 0, stale: 0, staleDetails: [] },
      commands: { pending: 0, stuck: 0, stuckDetails: [] },
      computedAt: NOW,
    });
  });

  it("classifies machines as online, stale, or offline", async () => {
    const { machines, useCase } = setup();
    const online = LocalMachine.register({ hostname: "fresh", os: "linux" });
    online.linkToWorkspace(WORKSPACE_ID);
    online.changeRuntimeStatus(LocalMachineRuntimeStatus.ONLINE, new Date(NOW.getTime() - 5_000));
    await machines.save(online);
    const stale = LocalMachine.register({ hostname: "dead-socket", os: "linux" });
    stale.linkToWorkspace(WORKSPACE_ID);
    stale.changeRuntimeStatus(LocalMachineRuntimeStatus.ONLINE, new Date(NOW.getTime() - 120_000));
    await machines.save(stale);
    const offline = LocalMachine.register({ hostname: "off", os: "linux" });
    offline.linkToWorkspace(WORKSPACE_ID);
    await machines.save(offline);

    const summary = await useCase.execute(WORKSPACE_ID);

    expect(summary.machines.total).toBe(3);
    expect(summary.machines.online).toBe(1);
    expect(summary.machines.stale).toBe(1);
    expect(summary.machines.offline).toBe(1);
    expect(summary.machines.staleDetails).toEqual([
      {
        id: stale.id.toString(),
        hostname: "dead-socket",
        lastSeenAt: new Date(NOW.getTime() - 120_000),
      },
    ]);
  });

  it("classifies executing sessions as active without treating parked conversations as stale", async () => {
    const { sessions, useCase } = setup();
    const fresh = AgentSession.start(
      { agentId: "a1", provider: "claude", workspaceId: WORKSPACE_ID, machineId: "m1" },
      new Date(NOW.getTime() - 5_000),
    );
    fresh.recordHeartbeat(new Date(NOW.getTime() - 5_000));
    await sessions.save(fresh);
    const goneQuiet = AgentSession.start(
      { agentId: "a2", provider: "claude", workspaceId: WORKSPACE_ID, machineId: "m1" },
      new Date(NOW.getTime() - 120_000),
    );
    await sessions.save(goneQuiet);
    const done = AgentSession.start(
      { agentId: "a3", provider: "claude", workspaceId: WORKSPACE_ID, machineId: "m1" },
      new Date(NOW.getTime() - 300_000),
    );
    done.changeStatus(AgentSessionStatus.RUNNING);
    done.changeStatus(AgentSessionStatus.COMPLETED);
    await sessions.save(done);
    const parked = AgentSession.start(
      { agentId: "a4", provider: "claude", workspaceId: WORKSPACE_ID, machineId: "m1" },
      new Date(NOW.getTime() - 300_000),
    );
    parked.changeStatus(AgentSessionStatus.RUNNING);
    parked.changeStatus(AgentSessionStatus.IDLE);
    await sessions.save(parked);

    const summary = await useCase.execute(WORKSPACE_ID);

    expect(summary.sessions.active).toBe(2);
    expect(summary.sessions.stale).toBe(1);
    expect(summary.sessions.staleDetails).toEqual([
      {
        id: goneQuiet.id.toString(),
        agentId: "a2",
        provider: "claude",
        status: AgentSessionStatus.STARTING,
        lastHeartbeatAt: null,
      },
    ]);
  });

  it("classifies PENDING/SENT commands older than the threshold as stuck, resolving the target machine's hostname", async () => {
    const { machines, commands, useCase } = setup();
    const machine = LocalMachine.register(
      { hostname: "bradley-workstation", os: "linux" },
      UniqueEntityId.create("m1"),
    );
    machine.linkToWorkspace(WORKSPACE_ID);
    await machines.save(machine);
    const recent = RuntimeCommand.enqueue(
      { machineId: "m1", workspaceId: WORKSPACE_ID, type: RuntimeCommandType.START_SESSION, payload: {} },
      new Date(NOW.getTime() - 5_000),
    );
    await commands.save(recent);
    const stuckPending = RuntimeCommand.enqueue(
      { machineId: "m1", workspaceId: WORKSPACE_ID, type: RuntimeCommandType.START_SESSION, payload: {} },
      new Date(NOW.getTime() - 90_000),
    );
    await commands.save(stuckPending);
    const stuckSent = RuntimeCommand.enqueue(
      { machineId: "m1", workspaceId: WORKSPACE_ID, type: RuntimeCommandType.STOP_PROCESS, payload: {} },
      new Date(NOW.getTime() - 90_000),
    );
    stuckSent.markSent();
    await commands.save(stuckSent);
    const completed = RuntimeCommand.enqueue(
      { machineId: "m1", workspaceId: WORKSPACE_ID, type: RuntimeCommandType.STOP_PROCESS, payload: {} },
      new Date(NOW.getTime() - 90_000),
    );
    completed.markSent();
    completed.markCompleted();
    await commands.save(completed);

    const summary = await useCase.execute(WORKSPACE_ID);

    expect(summary.commands.pending).toBe(3);
    expect(summary.commands.stuck).toBe(2);
    expect(summary.commands.stuckDetails).toEqual([
      {
        id: stuckPending.id.toString(),
        machineId: "m1",
        hostname: "bradley-workstation",
        type: RuntimeCommandType.START_SESSION,
        status: RuntimeCommandStatus.PENDING,
        payload: {},
        createdAt: new Date(NOW.getTime() - 90_000),
      },
      {
        id: stuckSent.id.toString(),
        machineId: "m1",
        hostname: "bradley-workstation",
        type: RuntimeCommandType.STOP_PROCESS,
        status: RuntimeCommandStatus.SENT,
        payload: {},
        createdAt: new Date(NOW.getTime() - 90_000),
      },
    ]);
  });
});
