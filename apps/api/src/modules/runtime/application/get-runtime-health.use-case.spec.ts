import { AgentSessionStatus, LocalMachineRuntimeStatus, RuntimeCommandType } from "@repo/db";

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
      machines: { total: 0, online: 0, stale: 0, offline: 0 },
      sessions: { active: 0, stale: 0 },
      commands: { pending: 0, stuck: 0 },
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

    expect(summary.machines).toEqual({ total: 3, online: 1, stale: 1, offline: 1 });
  });

  it("classifies non-terminal sessions as active, and flags the ones without a recent heartbeat as stale", async () => {
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

    const summary = await useCase.execute(WORKSPACE_ID);

    expect(summary.sessions).toEqual({ active: 2, stale: 1 });
  });

  it("classifies PENDING/SENT commands older than the threshold as stuck", async () => {
    const { commands, useCase } = setup();
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

    expect(summary.commands).toEqual({ pending: 3, stuck: 2 });
  });
});
