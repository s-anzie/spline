import { AggregateRoot } from "../domain/aggregate-root";
import { BaseDomainEvent } from "../domain/base-domain-event";
import { FakeEventPublisher } from "../testing/fake-event-publisher";
import { flushDomainEvents } from "./flush-domain-events";

class SomethingHappened extends BaseDomainEvent {
  readonly eventName = "test.something_happened";
}

interface Props {
  name: string;
}

class TestAggregate extends AggregateRoot<Props> {
  constructor(props: Props) {
    super(props);
  }

  act(now: Date): void {
    this.addDomainEvent(new SomethingHappened(this.id.value, now));
  }
}

describe("flushDomainEvents", () => {
  it("publishes every collected event, then clears the aggregate", async () => {
    const aggregate = new TestAggregate({ name: "a" });
    const publisher = new FakeEventPublisher();
    aggregate.act(new Date("2026-08-04T09:00:00Z"));
    aggregate.act(new Date("2026-08-04T09:01:00Z"));

    await flushDomainEvents(aggregate, publisher);

    expect(publisher.published).toHaveLength(2);
    expect(aggregate.domainEvents).toHaveLength(0);
  });

  it("is a no-op on an aggregate with no pending events", async () => {
    const aggregate = new TestAggregate({ name: "a" });
    const publisher = new FakeEventPublisher();

    await flushDomainEvents(aggregate, publisher);

    expect(publisher.published).toHaveLength(0);
  });
});
