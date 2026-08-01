import { Notification } from "../domain/notification";
import { GetNotificationUseCase } from "./get-notification.use-case";
import { NotificationNotFoundError } from "./notification-application.errors";
import { InMemoryNotificationRepository } from "./testing/in-memory-notification.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("GetNotificationUseCase", () => {
  it("returns the notification by id", async () => {
    const notifications = new InMemoryNotificationRepository();
    const notification = Notification.send({
      workspaceId: "w1",
      kind: "CHAT_MESSAGE",
      scope: "DIRECT",
      body: "Hello",
      createdBy: HUMAN_1,
    });
    await notifications.save(notification);
    const useCase = new GetNotificationUseCase(notifications);

    const result = await useCase.execute(notification.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.body).toBe("Hello");
  });

  it("fails when the notification does not exist", async () => {
    const notifications = new InMemoryNotificationRepository();
    const useCase = new GetNotificationUseCase(notifications);

    const result = await useCase.execute("unknown");

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(NotificationNotFoundError);
  });
});
