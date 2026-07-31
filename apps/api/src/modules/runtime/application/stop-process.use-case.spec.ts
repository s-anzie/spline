import { LockResourceType, ProcessStatus, RuntimeCommandType } from "@repo/db";

import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { AcquireLockUseCase } from "../../resource-lock/application/acquire-lock.use-case";
import { IsResourceLockedByActorUseCase } from "../../resource-lock/application/is-resource-locked-by-actor.use-case";
import { InMemoryResourceLockRepository } from "../../resource-lock/application/testing/in-memory-resource-lock.repository";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/in-memory-workspace.repository";
import { Workspace } from "../../workspace/domain/workspace";
import { Process } from "../domain/process";
import { StopProcessUseCase } from "./stop-process.use-case";
import { ProcessNotFoundError, ProcessNotLockedByRequesterError } from "./runtime-application.errors";
import { InMemoryProcessRepository } from "./testing/in-memory-process.repository";
import { InMemoryRuntimeCommandRepository } from "./testing/in-memory-runtime-command.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const NOW = new Date("2026-07-31T10:00:00Z");

async function setup() {
  const processes = new InMemoryProcessRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const locks = new InMemoryResourceLockRepository();
  const commands = new InMemoryRuntimeCommandRepository();
  const clock = new FakeClock(NOW);
  const eventPublisher = new FakeEventPublisher();

  const workspace = Workspace.create({ name: "My Project" });
  await workspaces.save(workspace);

  const process = Process.create({
    workspaceId: workspace.id.toString(),
    name: "Dev server",
    command: "npm run dev",
    cwd: "apps/web",
  });
  process.changeStatus(ProcessStatus.STARTING);
  process.recordDispatch("machine-1", undefined);
  process.recordPid(4242);
  process.changeStatus(ProcessStatus.RUNNING);
  await processes.save(process);

  const acquireLock = new AcquireLockUseCase(locks, new GetWorkspaceUseCase(workspaces), clock, eventPublisher);
  const isLockedByActor = new IsResourceLockedByActorUseCase(locks, clock);

  const useCase = new StopProcessUseCase(processes, commands, isLockedByActor, clock, eventPublisher);

  return { workspace, process, acquireLock, commands, useCase };
}

describe("StopProcessUseCase", () => {
  it("stops a running process the requester holds the lock on", async () => {
    const { workspace, process, acquireLock, commands, useCase } = await setup();
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

    const pending = await commands.listPendingByMachine("machine-1");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.type).toBe(RuntimeCommandType.STOP_PROCESS);
    expect(pending[0]?.payload).toMatchObject({ processId: process.id.toString(), pid: 4242 });
  });

  it("fails when the process does not exist", async () => {
    const { workspace, useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      processId: "unknown",
      requester: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ProcessNotFoundError);
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
