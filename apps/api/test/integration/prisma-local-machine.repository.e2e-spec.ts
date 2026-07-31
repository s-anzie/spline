import { LocalMachineRuntimeStatus } from "@repo/db";

import { PrismaLocalMachineRepository } from "../../src/modules/runtime/infrastructure/prisma-local-machine.repository";
import { LocalMachine } from "../../src/modules/runtime/domain/local-machine";
import { PrismaService } from "../../src/prisma/prisma.service";
import { UniqueEntityId } from "../../src/kernel/domain/unique-entity-id";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

describe("PrismaLocalMachineRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaLocalMachineRepository;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaLocalMachineRepository(prisma);
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists a machine and finds it back by id", async () => {
    const machine = LocalMachine.register({ hostname: "bradley-dev", os: "linux" });

    await repository.save(machine);
    const found = await repository.findById(machine.id);

    expect(found?.hostname).toBe("bradley-dev");
    expect(found?.runtimeStatus).toBe(LocalMachineRuntimeStatus.OFFLINE);
  });

  it("returns null for an unknown id", async () => {
    await expect(repository.findById(UniqueEntityId.create())).resolves.toBeNull();
  });

  it("lists machines linked to a workspace", async () => {
    const workspace = await prisma.workspace.create({ data: { name: "Test workspace" } });
    const linked = LocalMachine.register({ hostname: "linked", os: "linux" });
    linked.linkToWorkspace(workspace.id);
    await repository.save(linked);
    const unlinked = LocalMachine.register({ hostname: "unlinked", os: "linux" });
    await repository.save(unlinked);

    const found = await repository.listByWorkspace(workspace.id);

    expect(found.map((m) => m.hostname)).toEqual(["linked"]);
  });

  it("lists active (non-OFFLINE) machines", async () => {
    const online = LocalMachine.register({ hostname: "online", os: "linux" });
    online.changeRuntimeStatus(LocalMachineRuntimeStatus.ONLINE);
    await repository.save(online);
    await repository.save(LocalMachine.register({ hostname: "offline", os: "linux" }));

    const found = await repository.listActive();

    expect(found.map((m) => m.hostname)).toEqual(["online"]);
  });

  it("persists runtime status and heartbeat changes on save", async () => {
    const machine = LocalMachine.register({ hostname: "bradley-dev", os: "linux" });
    await repository.save(machine);

    machine.changeRuntimeStatus(LocalMachineRuntimeStatus.ONLINE);
    await repository.save(machine);

    const found = await repository.findById(machine.id);
    expect(found?.runtimeStatus).toBe(LocalMachineRuntimeStatus.ONLINE);
    expect(found?.lastSeenAt).not.toBeNull();
  });
});
