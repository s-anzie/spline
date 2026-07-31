import { ProcessStatus } from "@repo/db";

import { PrismaProcessRepository } from "../../src/modules/runtime/infrastructure/prisma-process.repository";
import { Process } from "../../src/modules/runtime/domain/process";
import { PrismaService } from "../../src/prisma/prisma.service";
import { UniqueEntityId } from "../../src/kernel/domain/unique-entity-id";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

describe("PrismaProcessRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaProcessRepository;
  let workspaceId: string;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaProcessRepository(prisma);
  });

  beforeEach(async () => {
    const workspace = await prisma.workspace.create({ data: { name: "Test workspace" } });
    workspaceId = workspace.id;
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists a process and finds it back by id", async () => {
    const process = Process.create({
      workspaceId,
      name: "Dev server",
      command: "npm run dev",
      cwd: "apps/web",
      ports: [3000],
    });

    await repository.save(process);
    const found = await repository.findById(process.id);

    expect(found?.name).toBe("Dev server");
    expect(found?.ports).toEqual([3000]);
    expect(found?.status).toBe(ProcessStatus.STOPPED);
  });

  it("returns null for an unknown id", async () => {
    await expect(repository.findById(UniqueEntityId.create())).resolves.toBeNull();
  });

  it("lists processes scoped to a workspace", async () => {
    await repository.save(Process.create({ workspaceId, name: "A", command: "npm run dev", cwd: "." }));
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    await repository.save(Process.create({ workspaceId: other.id, name: "B", command: "npm run dev", cwd: "." }));

    const found = await repository.listByWorkspace(workspaceId);

    expect(found.map((p) => p.name)).toEqual(["A"]);
  });

  it("lists active processes across workspaces", async () => {
    const active = Process.create({ workspaceId, name: "Active", command: "npm run dev", cwd: "." });
    active.changeStatus(ProcessStatus.STARTING);
    await repository.save(active);
    await repository.save(Process.create({ workspaceId, name: "Idle", command: "npm run dev", cwd: "." }));

    const found = await repository.listActive();

    expect(found.map((p) => p.name)).toEqual(["Active"]);
  });

  it("persists status, dispatch and pid changes on save", async () => {
    const machine = await prisma.localMachine.create({ data: { hostname: "bradley-dev", os: "linux" } });
    const process = Process.create({ workspaceId, name: "Dev server", command: "npm run dev", cwd: "." });
    await repository.save(process);

    process.changeStatus(ProcessStatus.STARTING);
    process.recordDispatch(machine.id, undefined);
    process.recordPid(4242);
    process.changeStatus(ProcessStatus.RUNNING);
    await repository.save(process);

    const found = await repository.findById(process.id);
    expect(found?.status).toBe(ProcessStatus.RUNNING);
    expect(found?.machineId).toBe(machine.id);
    expect(found?.pid).toBe(4242);
  });
});
