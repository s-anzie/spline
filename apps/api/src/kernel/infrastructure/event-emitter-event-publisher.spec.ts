import { EventEmitter2 } from "@nestjs/event-emitter";

import { DomainEvent } from "../domain/domain-event";
import { EventEmitterEventPublisher } from "./event-emitter-event-publisher";

class SomethingHappened extends DomainEvent {
  constructor(public readonly payload: string) {
    super("workspace-1");
  }

  get eventName(): string {
    return "something.happened";
  }
}

describe("EventEmitterEventPublisher", () => {
  it("emits a single event under its event name", () => {
    const emitter = new EventEmitter2();
    const publisher = new EventEmitterEventPublisher(emitter);
    const handler = jest.fn();
    emitter.on("something.happened", handler);

    const event = new SomethingHappened("hello");
    publisher.publish(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it("emits every event when publishing a batch, preserving order", () => {
    const emitter = new EventEmitter2();
    const publisher = new EventEmitterEventPublisher(emitter);
    const received: string[] = [];
    emitter.on("something.happened", (event: SomethingHappened) => {
      received.push(event.payload);
    });

    publisher.publishAll([new SomethingHappened("first"), new SomethingHappened("second")]);

    expect(received).toEqual(["first", "second"]);
  });
});
