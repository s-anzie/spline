import { Notification } from "../domain/notification";
import { NotificationRecipient } from "../domain/notification-recipient";
import { ListUnreadNotificationsForRecipientUseCase } from "./list-unread-notifications-for-recipient.use-case";
import { InMemoryNotificationRecipientRepository } from "./testing/in-memory-notification-recipient.repository";
import { InMemoryNotificationRepository } from "./testing/in-memory-notification.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const AGENT_1 = { type: "AGENT" as const, id: "agent-1" };
const AGENT_2 = { type: "AGENT" as const, id: "agent-2" };
const AGENT_3 = { type: "AGENT" as const, id: "agent-3" };

describe("ListUnreadNotificationsForRecipientUseCase", () => {
  it("reproduces the broadcast/partial-read scenario across workspaces: 3 agents, one reads, unread distinguishes all three", async () => {
    const notifications = new InMemoryNotificationRepository();
    const recipients = new InMemoryNotificationRecipientRepository();

    const notificationInWorkspace1 = Notification.send({
      workspaceId: "w1",
      kind: "SYSTEM_ALERT",
      scope: "BROADCAST",
      body: "Process crashed",
      createdBy: { type: "SYSTEM", id: "boot-reconciliation" },
    });
    await notifications.save(notificationInWorkspace1);

    const receiptAgent1 = NotificationRecipient.resolve({
      notificationId: notificationInWorkspace1.id.toString(),
      recipient: AGENT_1,
    });
    const receiptAgent2 = NotificationRecipient.resolve({
      notificationId: notificationInWorkspace1.id.toString(),
      recipient: AGENT_2,
    });
    const receiptAgent3 = NotificationRecipient.resolve({
      notificationId: notificationInWorkspace1.id.toString(),
      recipient: AGENT_3,
    });
    receiptAgent1.advanceTo("SEEN", new Date("2026-07-31T10:05:00Z"));
    await recipients.save(receiptAgent1);
    await recipients.save(receiptAgent2);
    await recipients.save(receiptAgent3);

    // A second notification in a DIFFERENT workspace, also unread for agent-2 — proves the query is cross-workspace.
    const notificationInWorkspace2 = Notification.send({
      workspaceId: "w2",
      kind: "CHAT_MESSAGE",
      scope: "DIRECT",
      body: "Can you review this?",
      createdBy: HUMAN_1,
    });
    await notifications.save(notificationInWorkspace2);
    await recipients.save(
      NotificationRecipient.resolve({ notificationId: notificationInWorkspace2.id.toString(), recipient: AGENT_2 }),
    );

    const useCase = new ListUnreadNotificationsForRecipientUseCase(recipients, notifications);

    const unreadForAgent1 = await useCase.execute({ recipientType: "AGENT", recipientId: "agent-1" });
    const unreadForAgent2 = await useCase.execute({ recipientType: "AGENT", recipientId: "agent-2" });
    const unreadForAgent3 = await useCase.execute({ recipientType: "AGENT", recipientId: "agent-3" });

    expect(unreadForAgent1).toHaveLength(0);
    expect(unreadForAgent2.map((u) => u.notification.workspaceId).sort()).toEqual(["w1", "w2"]);
    expect(unreadForAgent3).toHaveLength(1);
    expect(unreadForAgent3[0]?.notification.body).toBe("Process crashed");
  });
});
