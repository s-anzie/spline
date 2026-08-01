import { Notification } from "../../src/modules/notification/domain/notification";
import { NotificationRecipient } from "../../src/modules/notification/domain/notification-recipient";
import { PrismaNotificationRepository } from "../../src/modules/notification/infrastructure/prisma-notification.repository";
import { PrismaNotificationRecipientRepository } from "../../src/modules/notification/infrastructure/prisma-notification-recipient.repository";
import { PrismaService } from "../../src/prisma/prisma.service";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const AGENT_1 = { type: "AGENT" as const, id: "agent-1" };
const AGENT_2 = { type: "AGENT" as const, id: "agent-2" };

describe("PrismaNotificationRecipientRepository (integration)", () => {
  let prisma: PrismaService;
  let notifications: PrismaNotificationRepository;
  let repository: PrismaNotificationRecipientRepository;
  let workspaceId: string;
  let notificationId: string;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    notifications = new PrismaNotificationRepository(prisma);
    repository = new PrismaNotificationRecipientRepository(prisma);
  });

  beforeEach(async () => {
    const workspace = await prisma.workspace.create({ data: { name: "Test workspace" } });
    workspaceId = workspace.id;
    const notification = Notification.send({
      workspaceId,
      kind: "SYSTEM_ALERT",
      scope: "BROADCAST",
      body: "Process crashed",
      createdBy: { type: "SYSTEM", id: "boot-reconciliation" },
    });
    await notifications.save(notification);
    notificationId = notification.id.toString();
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists a recipient and finds it back by (notification, recipient)", async () => {
    const recipient = NotificationRecipient.resolve({ notificationId, recipient: AGENT_1 });
    await repository.save(recipient);

    const found = await repository.findByNotificationAndRecipient(notificationId, "AGENT", "agent-1");

    expect(found?.deliveryStatus).toBe("PENDING");
  });

  it("returns null when no recipient row exists yet", async () => {
    await expect(repository.findByNotificationAndRecipient(notificationId, "AGENT", "agent-1")).resolves.toBeNull();
  });

  it("lists all recipients for a notification", async () => {
    await repository.save(NotificationRecipient.resolve({ notificationId, recipient: AGENT_1 }));
    await repository.save(NotificationRecipient.resolve({ notificationId, recipient: AGENT_2 }));

    const all = await repository.listByNotification(notificationId);

    expect(all).toHaveLength(2);
  });

  it("reproduces the broadcast/partial-read scenario across workspaces via listUnreadByRecipient", async () => {
    const receiptAgent1 = NotificationRecipient.resolve({ notificationId, recipient: AGENT_1 });
    receiptAgent1.advanceTo("SEEN");
    await repository.save(receiptAgent1);
    await repository.save(NotificationRecipient.resolve({ notificationId, recipient: AGENT_2 }));

    const otherWorkspace = await prisma.workspace.create({ data: { name: "Other" } });
    const notificationInOtherWorkspace = Notification.send({
      workspaceId: otherWorkspace.id,
      kind: "CHAT_MESSAGE",
      scope: "DIRECT",
      body: "Review this",
      createdBy: HUMAN_1,
    });
    await notifications.save(notificationInOtherWorkspace);
    await repository.save(
      NotificationRecipient.resolve({ notificationId: notificationInOtherWorkspace.id.toString(), recipient: AGENT_2 }),
    );

    const unreadForAgent1 = await repository.listUnreadByRecipient("AGENT", "agent-1");
    const unreadForAgent2 = await repository.listUnreadByRecipient("AGENT", "agent-2");

    expect(unreadForAgent1).toHaveLength(0);
    expect(unreadForAgent2).toHaveLength(2);
    expect(unreadForAgent2.map((r) => r.notificationId).sort()).toEqual(
      [notificationId, notificationInOtherWorkspace.id.toString()].sort(),
    );
  });

  it("persists an advanced status (save is an upsert keyed by recipient id)", async () => {
    const recipient = NotificationRecipient.resolve({ notificationId, recipient: AGENT_1 });
    await repository.save(recipient);

    recipient.advanceTo("SEEN");
    await repository.save(recipient);

    const found = await repository.findByNotificationAndRecipient(notificationId, "AGENT", "agent-1");
    expect(found?.deliveryStatus).toBe("SEEN");
    expect(found?.readAt).not.toBeNull();
  });
});
