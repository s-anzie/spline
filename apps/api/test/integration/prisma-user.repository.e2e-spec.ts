import { PrismaUserRepository } from "../../src/modules/identity/infrastructure/prisma-user.repository";
import { PrismaService } from "../../src/prisma/prisma.service";
import { User } from "../../src/modules/identity/domain/user";
import { UniqueEntityId } from "../../src/kernel/domain/unique-entity-id";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

describe("PrismaUserRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaUserRepository;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaUserRepository(prisma);
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists a user and finds it back by id", async () => {
    const user = User.create({
      email: "someone@example.com",
      passwordHash: "hashed",
      displayName: "Someone",
    });

    await repository.save(user);
    const found = await repository.findById(user.id);

    expect(found?.email).toBe("someone@example.com");
    expect(found?.id.equals(user.id)).toBe(true);
  });

  it("finds a user by email", async () => {
    const user = User.create({
      email: "byemail@example.com",
      passwordHash: "hashed",
      displayName: "By Email",
    });
    await repository.save(user);

    const found = await repository.findByEmail("byemail@example.com");

    expect(found?.displayName).toBe("By Email");
  });

  it("returns null when the user does not exist", async () => {
    await expect(repository.findById(UniqueEntityId.create())).resolves.toBeNull();
    await expect(repository.findByEmail("nobody@example.com")).resolves.toBeNull();
  });

  it("updates an existing user on save (upsert)", async () => {
    const user = User.create({
      email: "update-me@example.com",
      passwordHash: "old-hash",
      displayName: "Old Name",
    });
    await repository.save(user);

    const reloaded = await repository.findById(user.id);
    const updated = User.create(
      {
        email: reloaded!.email,
        passwordHash: "new-hash",
        displayName: "New Name",
        createdAt: reloaded!.createdAt,
      },
      reloaded!.id,
    );
    await repository.save(updated);

    const found = await repository.findById(user.id);
    expect(found?.displayName).toBe("New Name");
    expect(found?.passwordHash).toBe("new-hash");
  });
});
