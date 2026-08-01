import { Event } from "./event";
import { EmptyEventTypeError } from "./event.errors";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const SYSTEM_ACTOR = { type: "SYSTEM" as const, id: "boot-reconciliation" };
const NOW = new Date("2026-07-31T10:00:00Z");

function recordEvent(overrides: Partial<Parameters<typeof Event.record>[0]> = {}, at: Date = NOW) {
  return Event.record(
    {
      workspaceId: "w1",
      type: "agent.intention",
      actor: HUMAN_1,
      payload: {},
      ...overrides,
    },
    at,
  );
}

describe("Event", () => {
  it("records an event with sensible defaults", () => {
    const event = recordEvent();

    expect(event.workspaceId).toBe("w1");
    expect(event.type).toBe("agent.intention");
    expect(event.severity).toBe("INFO");
    expect(event.actor).toEqual(HUMAN_1);
    expect(event.target).toBeUndefined();
    expect(event.payload).toEqual({});
    expect(event.createdAt).toEqual(NOW);
  });

  it("accepts a SYSTEM actor (not part of the strict human/agent ActorType enum)", () => {
    const event = recordEvent({ actor: SYSTEM_ACTOR, type: "process.crashed" });

    expect(event.actor).toEqual(SYSTEM_ACTOR);
  });

  it("accepts an explicit severity, target, and payload", () => {
    const event = recordEvent({
      severity: "CRITICAL",
      target: { type: "process", id: "process-1" },
      payload: { exitCode: 1 },
    });

    expect(event.severity).toBe("CRITICAL");
    expect(event.target).toEqual({ type: "process", id: "process-1" });
    expect(event.payload).toEqual({ exitCode: 1 });
  });

  it("records an EventRecorded domain event", () => {
    const event = recordEvent();

    expect(event.domainEvents.map((e) => e.eventName)).toEqual(["event.recorded"]);
  });

  it("rejects an empty type", () => {
    expect(() => recordEvent({ type: "   " })).toThrow(EmptyEventTypeError);
  });

  it("reconstitutes from persistence without emitting a domain event", () => {
    const original = recordEvent();
    const reconstituted = Event.reconstitute(
      {
        workspaceId: original.workspaceId,
        type: original.type,
        severity: original.severity,
        actor: original.actor,
        target: original.target,
        payload: original.payload,
        createdAt: original.createdAt,
      },
      original.id,
    );

    expect(reconstituted.domainEvents).toEqual([]);
    expect(reconstituted.type).toBe(original.type);
  });
});
