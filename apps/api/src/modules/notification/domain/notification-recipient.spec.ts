import { NotificationRecipient } from "./notification-recipient";

const AGENT_1 = { type: "AGENT" as const, id: "agent-1" };
const NOW = new Date("2026-07-31T10:00:00Z");

function resolve() {
  return NotificationRecipient.resolve({ notificationId: "notif-1", recipient: AGENT_1 });
}

describe("NotificationRecipient", () => {
  it("is created at PENDING", () => {
    const recipient = resolve();

    expect(recipient.notificationId).toBe("notif-1");
    expect(recipient.recipientType).toBe("AGENT");
    expect(recipient.recipientId).toBe("agent-1");
    expect(recipient.deliveryStatus).toBe("PENDING");
    expect(recipient.deliveredAt).toBeUndefined();
    expect(recipient.readAt).toBeUndefined();
    expect(recipient.acknowledgedAt).toBeUndefined();
    expect(recipient.actionTakenAt).toBeUndefined();
    expect(recipient.lastSeenAt).toBeUndefined();
    expect(recipient.failureReason).toBeUndefined();
  });

  describe("advanceTo", () => {
    it("advances PENDING -> DELIVERED -> SEEN -> ACKNOWLEDGED -> ACTED_ON, keeping earlier timestamps", () => {
      const recipient = resolve();

      const deliveredAt = new Date("2026-07-31T10:01:00Z");
      recipient.advanceTo("DELIVERED", deliveredAt);
      expect(recipient.deliveryStatus).toBe("DELIVERED");
      expect(recipient.deliveredAt).toEqual(deliveredAt);

      const seenAt = new Date("2026-07-31T10:02:00Z");
      recipient.advanceTo("SEEN", seenAt);
      expect(recipient.deliveryStatus).toBe("SEEN");
      expect(recipient.readAt).toEqual(seenAt);
      expect(recipient.lastSeenAt).toEqual(seenAt);

      const ackAt = new Date("2026-07-31T10:03:00Z");
      recipient.advanceTo("ACKNOWLEDGED", ackAt);
      expect(recipient.acknowledgedAt).toEqual(ackAt);

      const actedAt = new Date("2026-07-31T10:04:00Z");
      recipient.advanceTo("ACTED_ON", actedAt);
      expect(recipient.actionTakenAt).toEqual(actedAt);
      expect(recipient.deliveredAt).toEqual(deliveredAt);
      expect(recipient.readAt).toEqual(seenAt);
    });

    it("allows skipping straight to SEEN (delivery-then-read can race)", () => {
      const recipient = resolve();

      const seenAt = new Date("2026-07-31T10:05:00Z");
      recipient.advanceTo("SEEN", seenAt);

      expect(recipient.deliveryStatus).toBe("SEEN");
      // Reading proves delivery even when the explicit delivery event raced
      // behind the inbox fetch; cumulative receipts must remain complete.
      expect(recipient.deliveredAt).toEqual(seenAt);
      expect(recipient.readAt).toEqual(seenAt);
    });

    it("is idempotent (never regresses) when advancing to the current or an earlier status", () => {
      const recipient = resolve();
      recipient.advanceTo("ACKNOWLEDGED", NOW);

      recipient.advanceTo("SEEN", new Date("2026-07-31T11:00:00Z"));

      expect(recipient.deliveryStatus).toBe("ACKNOWLEDGED");
    });

    it("keeps readAt fixed to the first SEEN but bumps lastSeenAt on every re-view", () => {
      const recipient = resolve();
      const firstSeenAt = new Date("2026-07-31T10:02:00Z");
      recipient.advanceTo("SEEN", firstSeenAt);
      recipient.advanceTo("ACKNOWLEDGED", new Date("2026-07-31T10:03:00Z"));

      const reVisitAt = new Date("2026-07-31T12:00:00Z");
      recipient.advanceTo("SEEN", reVisitAt);

      expect(recipient.deliveryStatus).toBe("ACKNOWLEDGED");
      expect(recipient.readAt).toEqual(firstSeenAt);
      expect(recipient.lastSeenAt).toEqual(reVisitAt);
    });
  });

  describe("fail", () => {
    it("marks a PENDING recipient as FAILED with a reason", () => {
      const recipient = resolve();

      recipient.fail("connection refused");

      expect(recipient.deliveryStatus).toBe("FAILED");
      expect(recipient.failureReason).toBe("connection refused");
    });

    it("marks a DELIVERED recipient as FAILED", () => {
      const recipient = resolve();
      recipient.advanceTo("DELIVERED", NOW);

      recipient.fail("client disconnected before ack");

      expect(recipient.deliveryStatus).toBe("FAILED");
    });

    it("is a no-op once the recipient has already engaged (SEEN or further)", () => {
      const recipient = resolve();
      recipient.advanceTo("SEEN", NOW);

      recipient.fail("too late");

      expect(recipient.deliveryStatus).toBe("SEEN");
      expect(recipient.failureReason).toBeUndefined();
    });

    it("is a no-op once already FAILED", () => {
      const recipient = resolve();
      recipient.fail("first reason");

      recipient.fail("second reason");

      expect(recipient.failureReason).toBe("first reason");
    });
  });
});
