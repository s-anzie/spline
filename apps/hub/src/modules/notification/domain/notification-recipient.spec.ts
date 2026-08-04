import { ActorRef } from "../../identity/domain/actor";
import { NotificationRecipient } from "./notification-recipient";

const now = new Date("2026-08-04T10:00:00Z");
const later = new Date("2026-08-04T11:00:00Z");
const agent = ActorRef.create("AGENT", "a-1").value;

function addressed() {
  return NotificationRecipient.address({
    notificationId: "n-1",
    recipient: agent,
    now,
  }).value;
}

describe("NotificationRecipient", () => {
  it("starts pending, unread, with nothing claimed about it", () => {
    const recipient = addressed();

    expect(recipient.deliveryStatus).toBe("PENDING");
    expect(recipient.isUnread).toBe(true);
    expect(recipient.readAt).toBeNull();
    expect(recipient.failureReason).toBeNull();
  });

  it("stamps each step once, and only its own", () => {
    const recipient = addressed();

    expect(recipient.advanceTo("SEEN", later).isSuccess).toBe(true);
    expect(recipient.readAt).toEqual(later);
    expect(recipient.acknowledgedAt).toBeNull();

    expect(recipient.advanceTo("ACKNOWLEDGED", later).isSuccess).toBe(true);
    expect(recipient.acknowledgedAt).toEqual(later);
  });

  /**
   * §1.6 of doc.md: DELIVERED is a fact of the transport, the rest are
   * declarations of the recipient. Someone who polls their own unread list
   * (§10.4) was never pushed to — forcing them through DELIVERED would make
   * them lie.
   */
  it("lets a recipient who polled go straight from pending to seen", () => {
    const recipient = addressed();

    expect(recipient.advanceTo("SEEN", later).isSuccess).toBe(true);
    expect(recipient.deliveredAt).toBeNull();
  });

  it("still refuses acting on what was never acknowledged", () => {
    const recipient = addressed();
    recipient.advanceTo("SEEN", later);

    const result = recipient.advanceTo("ACTED_ON", later);

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("InvalidStateTransitionError");
  });

  it("never goes backwards", () => {
    const recipient = addressed();
    recipient.advanceTo("SEEN", later);

    expect(recipient.advanceTo("DELIVERED", later).isFailure).toBe(true);
    expect(recipient.deliveryStatus).toBe("SEEN");
  });

  /** §22.6 — a transition already satisfied is a no-op, never an exception. */
  it("is idempotent on a status already reached", () => {
    const recipient = addressed();
    recipient.advanceTo("SEEN", now);

    const again = recipient.advanceTo("SEEN", later);

    expect(again.isSuccess).toBe(true);
    expect(recipient.readAt).toEqual(now);
  });

  it("records a delivery failure with its reason, from pending only", () => {
    const recipient = addressed();

    expect(recipient.fail("no transport registered", later).isSuccess).toBe(true);
    expect(recipient.deliveryStatus).toBe("FAILED");
    expect(recipient.failureReason).toBe("no transport registered");
    // Still unread: a failed delivery is not a read message.
    expect(recipient.isUnread).toBe(true);
  });

  it("cannot bury an already-read message under a delivery failure", () => {
    const recipient = addressed();
    recipient.advanceTo("SEEN", later);

    expect(recipient.fail("late error", later).isFailure).toBe(true);
    expect(recipient.deliveryStatus).toBe("SEEN");
  });

  it("stops counting as unread once seen", () => {
    const recipient = addressed();
    recipient.advanceTo("DELIVERED", later);
    expect(recipient.isUnread).toBe(true);

    recipient.advanceTo("SEEN", later);

    expect(recipient.isUnread).toBe(false);
  });

  it("advertises what the recipient may do next (§20.6)", () => {
    const recipient = addressed();

    expect(recipient.allowedStatusTargets()).toEqual(["DELIVERED", "SEEN", "FAILED"]);
    recipient.advanceTo("SEEN", later);
    expect(recipient.allowedStatusTargets()).toEqual(["ACKNOWLEDGED"]);
  });
});
