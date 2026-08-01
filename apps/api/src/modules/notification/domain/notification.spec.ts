import { Notification } from "./notification";
import { EmptyNotificationBodyError } from "./notification.errors";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const NOW = new Date("2026-07-31T10:00:00Z");

function sendNotification(overrides: Partial<Parameters<typeof Notification.send>[0]> = {}, at: Date = NOW) {
  return Notification.send(
    {
      workspaceId: "w1",
      kind: "CHAT_MESSAGE",
      scope: "DIRECT",
      body: "Starting the dev server now",
      createdBy: HUMAN_1,
      ...overrides,
    },
    at,
  );
}

describe("Notification", () => {
  it("sends a notification with sensible defaults", () => {
    const notification = sendNotification();

    expect(notification.workspaceId).toBe("w1");
    expect(notification.kind).toBe("CHAT_MESSAGE");
    expect(notification.scope).toBe("DIRECT");
    expect(notification.body).toBe("Starting the dev server now");
    expect(notification.createdBy).toEqual(HUMAN_1);
    expect(notification.taskId).toBeUndefined();
    expect(notification.title).toBeUndefined();
    expect(notification.payload).toEqual({});
    expect(notification.linkedEventId).toBeUndefined();
    expect(notification.createdAt).toEqual(NOW);
  });

  it("accepts optional fields", () => {
    const notification = sendNotification({
      kind: "SYSTEM_ALERT",
      scope: "BROADCAST",
      taskId: "task-1",
      title: "Process crashed",
      payload: { exitCode: 1 },
      linkedEventId: "event-1",
      createdBy: { type: "SYSTEM", id: "boot-reconciliation" },
    });

    expect(notification.kind).toBe("SYSTEM_ALERT");
    expect(notification.scope).toBe("BROADCAST");
    expect(notification.taskId).toBe("task-1");
    expect(notification.title).toBe("Process crashed");
    expect(notification.payload).toEqual({ exitCode: 1 });
    expect(notification.linkedEventId).toBe("event-1");
    expect(notification.createdBy).toEqual({ type: "SYSTEM", id: "boot-reconciliation" });
  });

  it("records a NotificationSent domain event", () => {
    const notification = sendNotification();

    expect(notification.domainEvents.map((e) => e.eventName)).toEqual(["notification.sent"]);
  });

  it("rejects an empty body", () => {
    expect(() => sendNotification({ body: "   " })).toThrow(EmptyNotificationBodyError);
  });

  it("reconstitutes from persistence without emitting a domain event", () => {
    const original = sendNotification();
    const reconstituted = Notification.reconstitute(
      {
        workspaceId: original.workspaceId,
        kind: original.kind,
        scope: original.scope,
        taskId: original.taskId,
        title: original.title,
        body: original.body,
        payload: original.payload,
        linkedEventId: original.linkedEventId,
        createdBy: original.createdBy,
        createdAt: original.createdAt,
      },
      original.id,
    );

    expect(reconstituted.domainEvents).toEqual([]);
    expect(reconstituted.body).toBe(original.body);
  });
});
