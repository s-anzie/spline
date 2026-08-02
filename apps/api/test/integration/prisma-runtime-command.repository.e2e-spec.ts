import { RuntimeCommandType } from "@repo/db";

import { PrismaRuntimeCommandRepository } from "../../src/modules/runtime/infrastructure/prisma-runtime-command.repository";
import { RuntimeCommand } from "../../src/modules/runtime/domain/runtime-command";
import { PrismaService } from "../../src/prisma/prisma.service";
import { UniqueEntityId } from "../../src/kernel/domain/unique-entity-id";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

describe("PrismaRuntimeCommandRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaRuntimeCommandRepository;
  let workspaceId: string;
  let machineId: string;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaRuntimeCommandRepository(prisma);
  });

  beforeEach(async () => {
    const workspace = await prisma.workspace.create({ data: { name: "Test workspace" } });
    workspaceId = workspace.id;
    const machine = await prisma.localMachine.create({ data: { hostname: "bradley-dev", os: "linux" } });
    machineId = machine.id;
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists a command and finds it back by id", async () => {
    const command = RuntimeCommand.enqueue({
      machineId,
      workspaceId,
      type: RuntimeCommandType.START_PROCESS,
      payload: { processId: "process-1" },
    });

    await repository.save(command);
    const found = await repository.findById(command.id);

    expect(found?.type).toBe(RuntimeCommandType.START_PROCESS);
    expect(found?.payload).toEqual({ processId: "process-1" });
  });

  it("returns null for an unknown id", async () => {
    await expect(repository.findById(UniqueEntityId.create())).resolves.toBeNull();
  });

  it("lists PENDING commands for a machine, oldest first", async () => {
    const first = RuntimeCommand.enqueue(
      { machineId, workspaceId, type: RuntimeCommandType.START_PROCESS, payload: {} },
      new Date("2026-07-31T10:00:00Z"),
    );
    await repository.save(first);
    const second = RuntimeCommand.enqueue(
      { machineId, workspaceId, type: RuntimeCommandType.STOP_PROCESS, payload: {} },
      new Date("2026-07-31T10:01:00Z"),
    );
    await repository.save(second);
    const sent = RuntimeCommand.enqueue(
      { machineId, workspaceId, type: RuntimeCommandType.START_SESSION, payload: {} },
      new Date("2026-07-31T09:00:00Z"),
    );
    sent.markSent();
    await repository.save(sent);

    const pending = await repository.listPendingByMachine(machineId);

    expect(pending.map((c) => c.type)).toEqual([RuntimeCommandType.START_PROCESS, RuntimeCommandType.STOP_PROCESS]);
  });

  it("lists every command for a workspace regardless of status, oldest first", async () => {
    const otherWorkspace = await prisma.workspace.create({ data: { name: "Other" } });
    const first = RuntimeCommand.enqueue(
      { machineId, workspaceId, type: RuntimeCommandType.START_PROCESS, payload: {} },
      new Date("2026-07-31T10:00:00Z"),
    );
    await repository.save(first);
    const second = RuntimeCommand.enqueue(
      { machineId, workspaceId, type: RuntimeCommandType.START_SESSION, payload: {} },
      new Date("2026-07-31T10:01:00Z"),
    );
    second.markSent();
    await repository.save(second);
    const elsewhere = RuntimeCommand.enqueue(
      { machineId, workspaceId: otherWorkspace.id, type: RuntimeCommandType.STOP_PROCESS, payload: {} },
    );
    await repository.save(elsewhere);

    const found = await repository.listByWorkspace(workspaceId);

    expect(found.map((c) => c.id.toString())).toEqual([first.id.toString(), second.id.toString()]);
  });

  it("persists status transitions on save", async () => {
    const command = RuntimeCommand.enqueue({
      machineId,
      workspaceId,
      type: RuntimeCommandType.START_PROCESS,
      payload: {},
    });
    await repository.save(command);

    command.markSent();
    command.markCompleted();
    await repository.save(command);

    const found = await repository.findById(command.id);
    expect(found?.status).toBe("COMPLETED");
    expect(found?.completedAt).not.toBeNull();
  });
});
