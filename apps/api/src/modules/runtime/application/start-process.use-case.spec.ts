import { LockResourceType, RuntimeCommandType } from "@repo/db";

import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { AcquireLockUseCase } from "../../resource-lock/application/acquire-lock.use-case";
import { IsResourceLockedByActorUseCase } from "../../resource-lock/application/is-resource-locked-by-actor.use-case";
import { InMemoryResourceLockRepository } from "../../resource-lock/application/testing/in-memory-resource-lock.repository";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/in-memory-workspace.repository";
import { Workspace } from "../../workspace/domain/workspace";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { LocalMachine } from "../domain/local-machine";
import { Process } from "../domain/process";
import { StartProcessUseCase } from "./start-process.use-case";
import {
  MachineNotFoundError,
  MachineNotLinkedToWorkspaceError,
  ProcessCwdOutsideWorkspaceRootError,
  ProcessNotFoundError,
  ProcessNotLockedByRequesterError,
  WorkspaceRootPathNotConfiguredError,
} from "./runtime-application.errors";
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
  await processes.save(process);

  const acquireLock = new AcquireLockUseCase(locks, new GetWorkspaceUseCase(workspaces), clock, eventPublisher);
  const isLockedByActor = new IsResourceLockedByActorUseCase(locks, clock);

  const useCase = new StartProcessUseCase(
    processes,
    new GetWorkspaceUseCase(workspaces),
    machines,
    commands,
    isLockedByActor,
    clock,
    eventPublisher,
  );

  return { workspace, machine, process, workspaces, machines, processes, locks, commands, acquireLock, useCase };
}

describe("StartProcessUseCase", () => {
  it("dispatches the process to the machine when the requester holds the lock", async () => {
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
      machineId: machine.id.toString(),
      requester: HUMAN_1,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe("STARTING");
    expect(result.value.machineId).toBe(machine.id.toString());

    const pending = await commands.listPendingByMachine(machine.id.toString());
    expect(pending).toHaveLength(1);
    expect(pending[0]?.type).toBe(RuntimeCommandType.START_PROCESS);
    expect(pending[0]?.payload).toMatchObject({
      processId: process.id.toString(),
      command: "npm run dev",
      cwd: "/home/bradley/spline/apps/web",
    });
  });

  it("fails when the workspace does not exist", async () => {
    const { machine, process, useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: "unknown",
      processId: process.id.toString(),
      machineId: machine.id.toString(),
      requester: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("fails when the workspace has no root path configured", async () => {
    const { workspaces, machine, useCase } = await setup();
    const bareWorkspace = Workspace.create({ name: "No root" });
    await workspaces.save(bareWorkspace);
    const bareProcess = Process.create({
      workspaceId: bareWorkspace.id.toString(),
      name: "Dev server",
      command: "npm run dev",
      cwd: ".",
    });

    const result = await useCase.execute({
      workspaceId: bareWorkspace.id.toString(),
      processId: bareProcess.id.toString(),
      machineId: machine.id.toString(),
      requester: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceRootPathNotConfiguredError);
  });

  it("fails when the process does not exist", async () => {
    const { workspace, machine, useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      processId: "unknown",
      machineId: machine.id.toString(),
      requester: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ProcessNotFoundError);
  });

  it("fails when the cwd escapes the workspace root", async () => {
    const { workspace, machine, processes, useCase } = await setup();
    const escapee = Process.create({
      workspaceId: workspace.id.toString(),
      name: "Evil",
      command: "cat /etc/passwd",
      cwd: "../../etc",
    });
    await processes.save(escapee);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      processId: escapee.id.toString(),
      machineId: machine.id.toString(),
      requester: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ProcessCwdOutsideWorkspaceRootError);
  });

  it("fails when the machine does not exist", async () => {
    const { workspace, process, useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      processId: process.id.toString(),
      machineId: "unknown",
      requester: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(MachineNotFoundError);
  });

  it("fails when the machine is not linked to the workspace", async () => {
    const { workspace, process, machines, useCase } = await setup();
    const unlinked = LocalMachine.register({ hostname: "other", os: "linux" });
    await machines.save(unlinked);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      processId: process.id.toString(),
      machineId: unlinked.id.toString(),
      requester: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(MachineNotLinkedToWorkspaceError);
  });

  it("fails when the requester does not hold the lock on the process", async () => {
    const { workspace, machine, process, useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      processId: process.id.toString(),
      machineId: machine.id.toString(),
      requester: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ProcessNotLockedByRequesterError);
  });
});
