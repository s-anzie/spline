import { LockResourceType, ProcessStatus, RuntimeCommandType } from "@repo/db";

import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { AcquireLockUseCase } from "../../resource-lock/application/acquire-lock.use-case";
import { IsResourceLockedByActorUseCase } from "../../resource-lock/application/is-resource-locked-by-actor.use-case";
import { InMemoryResourceLockRepository } from "../../resource-lock/application/testing/in-memory-resource-lock.repository";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/in-memory-workspace.repository";
import { Workspace } from "../../workspace/domain/workspace";
import { LocalMachine } from "../domain/local-machine";
import { Process } from "../domain/process";
import { RestartProcessUseCase } from "./restart-process.use-case";
import { ProcessNotLockedByRequesterError } from "./runtime-application.errors";
import { InMemoryLocalMachineRepository } from "./testing/in-memory-local-machine.repository";
import { InMemoryProcessRepository } from "./testing/in-memory-process.repository";
import { InMemoryRuntimeCommandRepository } from "./testing/in-memory-runtime-command.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const NOW = new Date("2026-07-31T10:00:00Z");

async function setup() {
  const processes = new InMemoryProcessRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const machines = new InMemoryLocalMachineRepository();
  const locks = new InMemoryResourceLockRepository();
  const commands = new InMemoryRuntimeCommandRepository();
  const clock = new FakeClock(NOW);
  const eventPublisher = new FakeEventPublisher();

  const workspace = Workspace.create({ name: "My Project" });
  workspace.setRootPath("/home/bradley/spline");
  await workspaces.save(workspace);

  const machine = LocalMachine.register({ hostname: "bradley-dev", os: "linux" });
  machine.linkToWorkspace(workspace.id.toString());
  await machines.save(machine);

  const process = Process.create({
    workspaceId: workspace.id.toString(),
    name: "Dev server",
    command: "npm run dev",
    cwd: "apps/web",
  });
  process.changeStatus(ProcessStatus.STARTING);
  process.recordDispatch(machine.id.toString(), undefined);
  process.recordPid(4242);
  process.changeStatus(ProcessStatus.RUNNING);
  await processes.save(process);

  const acquireLock = new AcquireLockUseCase(locks, new GetWorkspaceUseCase(workspaces), clock, eventPublisher);
  const isLockedByActor = new IsResourceLockedByActorUseCase(locks, clock);

  const useCase = new RestartProcessUseCase(
    processes,
    new GetWorkspaceUseCase(workspaces),
    commands,
    isLockedByActor,
    clock,
    eventPublisher,
  );

  return { workspace, machine, process, acquireLock, commands, useCase };
}

describe("RestartProcessUseCase", () => {
  it("stops then re-enqueues a start for a running process", async () => {
    const { workspace, machine, process, acquireLock, commands, useCase } = await setup();
    await acquireLock.execute({
      workspaceId: workspace.id.toString(),
      resourceType: LockResourceType.PROCESS,
      resourceId: process.id.toString(),
      lockedBy: HUMAN_1,
    });

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      processId: process.id.toString(),
      requester: HUMAN_1,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(ProcessStatus.STOPPING);

    const pending = await commands.listPendingByMachine(machine.id.toString());
    expect(pending.map((c) => c.type)).toEqual([
      RuntimeCommandType.STOP_PROCESS,
      RuntimeCommandType.START_PROCESS,
    ]);
  });

  it("fails when the requester does not hold the lock", async () => {
    const { workspace, process, useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      processId: process.id.toString(),
      requester: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ProcessNotLockedByRequesterError);
  });
});
