import { EventEmitter2 } from "@nestjs/event-emitter";

import { DomainEvent } from "../domain/domain-event";
import { EventEmitterEventPublisher } from "./event-emitter-event-publisher";

class TestEvent implements DomainEvent {
  readonly eventName = "workspace.created";
  readonly occurredAt = new Date();
  readonly workspaceId = null;
  constructor(readonly aggregateId: string) {}
}

describe("EventEmitterEventPublisher", () => {
  it("emits the event under its eventName", async () => {
    const emitter = new EventEmitter2();
    const publisher = new EventEmitterEventPublisher(emitter);
    const received: DomainEvent[] = [];
    emitter.on("workspace.created", (event: DomainEvent) => received.push(event));

    const event = new TestEvent("w-1");
    await publisher.publish(event);

    expect(received).toEqual([event]);
  });

  it("publishAll publishes every event in order", async () => {
    const emitter = new EventEmitter2();
    const publisher = new EventEmitterEventPublisher(emitter);
    const received: string[] = [];
    emitter.on("workspace.created", (event: TestEvent) =>
      received.push(event.aggregateId),
    );

    await publisher.publishAll([new TestEvent("w-1"), new TestEvent("w-2")]);

    expect(received).toEqual(["w-1", "w-2"]);
  });
});
