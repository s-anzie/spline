import { PrismaMachineCredentialRepository } from "../../src/modules/identity/infrastructure/prisma-machine-credential.repository";
import { MachineCredential } from "../../src/modules/identity/domain/machine-credential";
import { PrismaService } from "../../src/prisma/prisma.service";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

describe("PrismaMachineCredentialRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaMachineCredentialRepository;
  let machineId: string;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaMachineCredentialRepository(prisma);
  });

  beforeEach(async () => {
    const machine = await prisma.localMachine.create({ data: { hostname: "bradley-dev", os: "linux" } });
    machineId = machine.id;
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists a credential and finds it back by id and by machine id", async () => {
    const credential = MachineCredential.create({ machineId, tokenHash: "hash" });

    await repository.save(credential);

    await expect(repository.findById(credential.id)).resolves.not.toBeNull();
    const byMachine = await repository.findByMachineId(machineId);
    expect(byMachine?.tokenHash).toBe("hash");
  });

  it("persists revocation", async () => {
    const credential = MachineCredential.create({ machineId, tokenHash: "hash" });
    await repository.save(credential);

    credential.revoke(new Date());
    await repository.save(credential);

    const found = await repository.findById(credential.id);
    expect(found?.isActive()).toBe(false);
  });
});
