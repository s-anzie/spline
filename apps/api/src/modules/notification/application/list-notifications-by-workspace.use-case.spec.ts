import { Notification } from "../domain/notification";
import { ListNotificationsByWorkspaceUseCase } from "./list-notifications-by-workspace.use-case";
import { InMemoryNotificationRepository } from "./testing/in-memory-notification.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("ListNotificationsByWorkspaceUseCase", () => {
  it("lists only notifications belonging to the given workspace", async () => {
    const notifications = new InMemoryNotificationRepository();
    await notifications.save(
      Notification.send({ workspaceId: "w1", kind: "CHAT_MESSAGE", scope: "DIRECT", body: "A", createdBy: HUMAN_1 }),
    );
    await notifications.save(
      Notification.send({ workspaceId: "w1", kind: "CHAT_MESSAGE", scope: "DIRECT", body: "B", createdBy: HUMAN_1 }),
    );
    await notifications.save(
      Notification.send({ workspaceId: "w2", kind: "CHAT_MESSAGE", scope: "DIRECT", body: "C", createdBy: HUMAN_1 }),
    );
    const useCase = new ListNotificationsByWorkspaceUseCase(notifications);

    const result = await useCase.execute("w1");

    expect(result.map((n) => n.body).sort()).toEqual(["A", "B"]);
  });
});
