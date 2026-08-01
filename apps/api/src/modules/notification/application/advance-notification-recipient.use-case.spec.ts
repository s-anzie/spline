import { NotificationDeliveryStatus } from "@repo/db";

import { FakeClock } from "../../../kernel/testing/fake-clock";
import { NotificationRecipient } from "../domain/notification-recipient";
import { AdvanceNotificationRecipientUseCase } from "./advance-notification-recipient.use-case";
import { NotificationRecipientNotFoundError } from "./notification-application.errors";
import { InMemoryNotificationRecipientRepository } from "./testing/in-memory-notification-recipient.repository";

const AGENT_1 = { type: "AGENT" as const, id: "agent-1" };
const NOW = new Date("2026-07-31T10:00:00Z");

async function setup() {
  const recipients = new InMemoryNotificationRecipientRepository();
  const clock = new FakeClock(NOW);

  const recipient = NotificationRecipient.resolve({ notificationId: "notif-1", recipient: AGENT_1 });
  await recipients.save(recipient);

  const useCase = new AdvanceNotificationRecipientUseCase(recipients, clock);

  return { recipient, recipients, useCase };
}

describe("AdvanceNotificationRecipientUseCase", () => {
  it("advances the caller's own recipient row, looked up by (notification, actor) — never a raw recipient-row id from the client", async () => {
    const { recipients, useCase } = await setup();

    const result = await useCase.execute({
      notificationId: "notif-1",
      actor: AGENT_1,
      status: NotificationDeliveryStatus.SEEN,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.deliveryStatus).toBe("SEEN");
    expect(result.value.readAt).toEqual(NOW);
    const persisted = await recipients.findByNotificationAndRecipient("notif-1", "AGENT", "agent-1");
    expect(persisted?.deliveryStatus).toBe("SEEN");
  });

  it("fails when the caller has no recipient row for that notification", async () => {
    const { useCase } = await setup();

    const result = await useCase.execute({
      notificationId: "notif-1",
      actor: { type: "AGENT", id: "some-other-agent" },
      status: NotificationDeliveryStatus.SEEN,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(NotificationRecipientNotFoundError);
  });
});
