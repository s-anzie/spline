import { EventReceipt } from "./event-receipt";
import { InvalidEventReceiptStatusError } from "./event-receipt.errors";

const AGENT_1 = { type: "AGENT" as const, id: "agent-1" };
const NOW = new Date("2026-07-31T10:00:00Z");

function mark(status: "SEEN" | "ACKNOWLEDGED" | "ACTED" = "SEEN", at: Date = NOW) {
  return EventReceipt.mark({ eventId: "event-1", actor: AGENT_1, status }, at);
}

describe("EventReceipt", () => {
  it("is created at SEEN by default", () => {
    const receipt = mark();

    expect(receipt.eventId).toBe("event-1");
    expect(receipt.actorType).toBe("AGENT");
    expect(receipt.actorId).toBe("agent-1");
    expect(receipt.status).toBe("SEEN");
    expect(receipt.seenAt).toEqual(NOW);
    expect(receipt.acknowledgedAt).toBeUndefined();
    expect(receipt.actedAt).toBeUndefined();
  });

  it("can be created directly at ACKNOWLEDGED or ACTED (an actor may skip straight to acting)", () => {
    const acted = mark("ACTED");

    expect(acted.status).toBe("ACTED");
    expect(acted.actedAt).toEqual(NOW);
  });

  describe("advanceTo", () => {
    it("advances SEEN -> ACKNOWLEDGED -> ACTED, keeping earlier timestamps", () => {
      const receipt = mark("SEEN", NOW);

      const ackAt = new Date("2026-07-31T10:05:00Z");
      receipt.advanceTo("ACKNOWLEDGED", ackAt);
      expect(receipt.status).toBe("ACKNOWLEDGED");
      expect(receipt.seenAt).toEqual(NOW);
      expect(receipt.acknowledgedAt).toEqual(ackAt);

      const actedAt = new Date("2026-07-31T10:10:00Z");
      receipt.advanceTo("ACTED", actedAt);
      expect(receipt.status).toBe("ACTED");
      expect(receipt.acknowledgedAt).toEqual(ackAt);
      expect(receipt.actedAt).toEqual(actedAt);
    });

    it("allows SEEN -> ACTED directly, skipping ACKNOWLEDGED", () => {
      const receipt = mark("SEEN", NOW);

      const actedAt = new Date("2026-07-31T10:10:00Z");
      receipt.advanceTo("ACTED", actedAt);

      expect(receipt.status).toBe("ACTED");
      expect(receipt.acknowledgedAt).toBeUndefined();
      expect(receipt.actedAt).toEqual(actedAt);
    });

    it("is idempotent when advancing to the same status", () => {
      const receipt = mark("ACKNOWLEDGED", NOW);

      expect(() => receipt.advanceTo("ACKNOWLEDGED", new Date("2026-07-31T11:00:00Z"))).not.toThrow();
      expect(receipt.acknowledgedAt).toEqual(NOW);
    });

    it("is a no-op (never regresses) when advancing to an earlier status", () => {
      const receipt = mark("ACTED", NOW);

      receipt.advanceTo("SEEN", new Date("2026-07-31T11:00:00Z"));

      expect(receipt.status).toBe("ACTED");
    });
  });
});

describe("EventReceipt.mark validation", () => {
  it("rejects an invalid status", () => {
    expect(() =>
      // @ts-expect-error deliberately invalid for the test
      EventReceipt.mark({ eventId: "event-1", actor: AGENT_1, status: "BOGUS" }, NOW),
    ).toThrow(InvalidEventReceiptStatusError);
  });
});
