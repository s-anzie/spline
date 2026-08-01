import { Notification } from "../../src/modules/notification/domain/notification";
import { PrismaNotificationRepository } from "../../src/modules/notification/infrastructure/prisma-notification.repository";
import { PrismaService } from "../../src/prisma/prisma.service";
import { UniqueEntityId } from "../../src/kernel/domain/unique-entity-id";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const SYSTEM_ACTOR = { type: "SYSTEM" as const, id: "boot-reconciliation" };

describe("PrismaNotificationRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaNotificationRepository;
  let workspaceId: string;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaNotificationRepository(prisma);
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

  it("persists a notification with a SYSTEM creator and finds it back", async () => {
    const notification = Notification.send({
      workspaceId,
      kind: "SYSTEM_ALERT",
      scope: "BROADCAST",
      title: "Process crashed",
      body: "process-1 exited with code 1",
      payload: { exitCode: 1 },
      createdBy: SYSTEM_ACTOR,
    });

    await repository.save(notification);
    const found = await repository.findById(notification.id);

    expect(found?.kind).toBe("SYSTEM_ALERT");
    expect(found?.scope).toBe("BROADCAST");
    expect(found?.title).toBe("Process crashed");
    expect(found?.createdBy).toEqual(SYSTEM_ACTOR);
    expect(found?.payload).toEqual({ exitCode: 1 });
  });

  it("returns null for an unknown id", async () => {
    await expect(repository.findById(UniqueEntityId.create())).resolves.toBeNull();
  });

  it("lists notifications scoped to a workspace", async () => {
    await repository.save(
      Notification.send({ workspaceId, kind: "CHAT_MESSAGE", scope: "DIRECT", body: "Hi", createdBy: HUMAN_1 }),
    );
    const otherWorkspace = await prisma.workspace.create({ data: { name: "Other" } });
    await repository.save(
      Notification.send({
        workspaceId: otherWorkspace.id,
        kind: "CHAT_MESSAGE",
        scope: "DIRECT",
        body: "Hi",
        createdBy: HUMAN_1,
      }),
    );

    const found = await repository.listByWorkspace(workspaceId);

    expect(found).toHaveLength(1);
  });
});
