import { ActorRef } from "../../identity/domain/actor";
import { EventReceipt } from "./event-receipt";

const now = new Date("2026-08-04T10:00:00.000Z");
const t1 = new Date("2026-08-04T10:01:00.000Z");
const t2 = new Date("2026-08-04T10:02:00.000Z");
const t3 = new Date("2026-08-04T10:03:00.000Z");
const agent = ActorRef.create("AGENT", "a-1").value;

function require_(actor = agent) {
  return EventReceipt.require({ eventId: "e-1", actor, now });
}

/**
 * §4.20/§14.4: an Event carries no read state of its own. Taking notice is
 * individual, so it lives here — one receipt per (event, actor).
 */
describe("EventReceipt", () => {
  it("starts PENDING with no timestamps", () => {
    const receipt = require_().value;

    expect(receipt.status).toBe("PENDING");
    expect(receipt.seenAt).toBeNull();
    expect(receipt.acknowledgedAt).toBeNull();
    expect(receipt.actedAt).toBeNull();
    expect(receipt.domainEvents[0]?.eventName).toBe("event.receipt_required");
  });

  it("advances PENDING → SEEN → ACKNOWLEDGED → ACTED, stamping each step", () => {
    const receipt = require_().value;

    expect(receipt.advanceTo("SEEN", t1).isSuccess).toBe(true);
    expect(receipt.seenAt).toEqual(t1);
    expect(receipt.advanceTo("ACKNOWLEDGED", t2).isSuccess).toBe(true);
    expect(receipt.acknowledgedAt).toEqual(t2);
    expect(receipt.advanceTo("ACTED", t3).isSuccess).toBe(true);
    expect(receipt.actedAt).toEqual(t3);
    expect(receipt.status).toBe("ACTED");
  });

  it("refuses to skip a step — nobody acted on what they never acknowledged", () => {
    const receipt = require_().value;

    const result = receipt.advanceTo("ACTED", t1);

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("InvalidStateTransitionError");
  });

  it("never goes backwards", () => {
    const receipt = require_().value;
    receipt.advanceTo("SEEN", t1);
    receipt.advanceTo("ACKNOWLEDGED", t2);

    expect(receipt.advanceTo("SEEN", t3).isFailure).toBe(true);
  });

  it("re-declaring the same step is an idempotent no-op keeping the first stamp", () => {
    const receipt = require_().value;
    receipt.advanceTo("SEEN", t1);
    receipt.clearDomainEvents();

    expect(receipt.advanceTo("SEEN", t3).isSuccess).toBe(true);
    expect(receipt.seenAt).toEqual(t1);
    expect(receipt.domainEvents).toHaveLength(0);
  });

  it("ACTED is terminal", () => {
    const receipt = require_().value;
    for (const step of ["SEEN", "ACKNOWLEDGED", "ACTED"] as const) {
      receipt.advanceTo(step, t1);
    }

    const result = receipt.advanceTo("SEEN", t2);

    expect(result.isFailure).toBe(true);
    expect(result.error.fromTerminal).toBe(true);
  });

  it("exposes what the holder may declare next (§20.6)", () => {
    const receipt = require_().value;

    expect(receipt.allowedStatusTargets()).toEqual(["SEEN"]);
  });

  it("reconstitute rebuilds without events", () => {
    const receipt = EventReceipt.reconstitute(
      {
        eventId: "e-1",
        actor: agent,
        status: "ACKNOWLEDGED",
        seenAt: t1,
        acknowledgedAt: t2,
        actedAt: null,
        createdAt: now,
      },
      "r-1",
    );

    expect(receipt.status).toBe("ACKNOWLEDGED");
    expect(receipt.domainEvents).toHaveLength(0);
  });
});
