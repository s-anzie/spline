import { DomainEvent } from "../../../kernel/domain/domain-event";
import { ActorRef } from "../../identity/domain/actor";
import { Event } from "./event";

const now = new Date("2026-08-04T10:00:00.000Z");
const agent = ActorRef.create("AGENT", "a-1").value;

function record(overrides: Partial<Parameters<typeof Event.record>[0]> = {}) {
  return Event.record({
    workspaceId: "w-1",
    type: "task.status_changed",
    targetType: "task",
    targetId: "t-1",
    now,
    ...overrides,
  });
}

describe("Event", () => {
  describe("record", () => {
    it("captures a fact with a default INFO severity", () => {
      const result = record();

      expect(result.isSuccess).toBe(true);
      const event = result.value;
      expect(event.type).toBe("task.status_changed");
      expect(event.severity).toBe("INFO");
      expect(event.targetType).toBe("task");
      expect(event.targetId).toBe("t-1");
      expect(event.actor).toBeNull();
      expect(event.payload).toEqual({});
      expect(event.createdAt).toEqual(now);
    });

    it("accepts a null workspace — some facts sit above workspaces (§4.20)", () => {
      const event = record({ workspaceId: null, type: "identity.user_registered" }).value;

      expect(event.workspaceId).toBeNull();
    });

    it("carries an actor, a severity and a payload when they are known", () => {
      const event = record({
        actor: agent,
        severity: "ERROR",
        payload: { from: "RUNNING", to: "FAILED" },
      }).value;

      expect(event.actor?.actorId).toBe("a-1");
      expect(event.severity).toBe("ERROR");
      expect(event.payload["to"]).toBe("FAILED");
    });

    it("requires a type and a target", () => {
      expect(record({ type: " " }).isFailure).toBe(true);
      expect(record({ targetType: "" }).isFailure).toBe(true);
      expect(record({ targetId: "  " }).isFailure).toBe(true);
    });

    it("raises no domain event of its own — a fact about facts would not end", () => {
      expect(record().value.domainEvents).toHaveLength(0);
    });
  });

  describe("projection from a domain event", () => {
    it("derives type, target and workspace without the event knowing about it", () => {
      const concreteEvent: DomainEvent & Record<string, unknown> = {
        eventName: "goal.status_changed",
        occurredAt: now,
        aggregateId: "g-1",
        workspaceId: "w-1",
        from: "ACTIVE",
        to: "REVIEW",
      };

      const event = Event.fromDomainEvent(concreteEvent, 1n).value;

      expect(event.type).toBe("goal.status_changed");
      // The prefix of the name is the kind of thing the fact is about.
      expect(event.targetType).toBe("goal");
      expect(event.targetId).toBe("g-1");
      expect(event.workspaceId).toBe("w-1");
      expect(event.sequence).toBe(1n);
    });

    it("keeps the event's own fields as payload, dropping the standard ones", () => {
      const concreteEvent: DomainEvent & Record<string, unknown> = {
        eventName: "task.blocker_reported",
        occurredAt: now,
        aggregateId: "t-1",
        workspaceId: "w-1",
        blockerId: "b-1",
        blockerType: "TECHNICAL",
      };

      const event = Event.fromDomainEvent(concreteEvent, 2n).value;

      expect(event.payload).toEqual({ blockerId: "b-1", blockerType: "TECHNICAL" });
    });

    it("assigns severity by convention rather than by declaration", () => {
      const failed = Event.fromDomainEvent(
        { eventName: "task.blocker_reported", occurredAt: now, aggregateId: "t", workspaceId: "w" },
        3n,
      ).value;
      const ordinary = Event.fromDomainEvent(
        { eventName: "task.created", occurredAt: now, aggregateId: "t", workspaceId: "w" },
        4n,
      ).value;

      expect(failed.severity).toBe("WARNING");
      expect(ordinary.severity).toBe("INFO");
    });

    it("refuses a name that carries no category", () => {
      const result = Event.fromDomainEvent(
        { eventName: "malformed", occurredAt: now, aggregateId: "x", workspaceId: null },
        5n,
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("MalformedEventTypeError");
    });
  });

  it("reconstitute rebuilds a stored fact", () => {
    const event = Event.reconstitute(
      {
        workspaceId: "w-1",
        type: "task.created",
        severity: "INFO",
        actor: agent,
        targetType: "task",
        targetId: "t-1",
        payload: {},
        sequence: 7n,
        createdAt: now,
      },
      "e-1",
    );

    expect(event.id.value).toBe("e-1");
    expect(event.sequence).toBe(7n);
  });
});
