import { EventEmitter2 } from "@nestjs/event-emitter";

import { DomainEvent } from "../../../kernel/domain/domain-event";
import { InMemoryEventRepository } from "../application/testing/event.doubles";
import { PersistentEventPublisher } from "./persistent-event-publisher";

const now = new Date("2026-08-04T10:00:00.000Z");

function domainEvent(name: string, workspaceId: string | null = "w-1"): DomainEvent {
  return { eventName: name, occurredAt: now, aggregateId: "t-1", workspaceId };
}

/**
 * The whole point of this module: a fact is written before anyone reacts to
 * it, so a reaction lost to a crash can still be found in the journal.
 */
describe("PersistentEventPublisher", () => {
  function makePublisher() {
    const events = new InMemoryEventRepository();
    const emitter = new EventEmitter2({ wildcard: true, delimiter: "." });
    return { events, emitter, publisher: new PersistentEventPublisher(events, emitter) };
  }

  it("writes the fact to the journal, then emits it in process", async () => {
    const ctx = makePublisher();
    const seen: string[] = [];
    ctx.emitter.on("task.created", () => seen.push("reacted"));

    await ctx.publisher.publish(domainEvent("task.created"));

    expect(ctx.events.events).toHaveLength(1);
    expect(ctx.events.events[0]?.type).toBe("task.created");
    expect(seen).toEqual(["reacted"]);
  });

  it("writes before emitting — a reaction can rely on the fact being on record", async () => {
    const ctx = makePublisher();
    let journalledWhenReacting = 0;
    ctx.emitter.on("task.created", () => {
      journalledWhenReacting = ctx.events.events.length;
    });

    await ctx.publisher.publish(domainEvent("task.created"));

    expect(journalledWhenReacting).toBe(1);
  });

  it("assigns a total order, not a timestamp — two facts share a millisecond", async () => {
    const ctx = makePublisher();

    await ctx.publisher.publishAll([
      domainEvent("task.created"),
      domainEvent("task.updated"),
    ]);

    expect(ctx.events.events.map((event) => event.sequence)).toEqual([1n, 2n]);
  });

  it("keeps a fact that belongs to no workspace", async () => {
    const ctx = makePublisher();

    await ctx.publisher.publish(domainEvent("identity.user_registered", null));

    expect(ctx.events.events[0]?.workspaceId).toBeNull();
  });

  it("still emits a fact whose name carries no category, but journals nothing", async () => {
    const ctx = makePublisher();
    const seen: string[] = [];
    ctx.emitter.on("malformed", () => seen.push("reacted"));

    await ctx.publisher.publish(domainEvent("malformed"));

    // Refusing to emit would break existing reactions over a naming slip;
    // refusing to journal keeps the store's shape honest.
    expect(seen).toEqual(["reacted"]);
    expect(ctx.events.events).toHaveLength(0);
  });
});
