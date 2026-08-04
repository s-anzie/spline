import { AggregateRoot } from "./aggregate-root";
import { DomainEvent } from "./domain-event";

class TestEvent implements DomainEvent {
  readonly eventName = "test.happened";
  readonly occurredAt = new Date();
  constructor(readonly aggregateId: string) {}
}

interface Props {
  name: string;
}

class TestAggregate extends AggregateRoot<Props> {
  constructor(props: Props) {
    super(props);
  }

  doSomething(): void {
    this.addDomainEvent(new TestEvent(this.id.value));
  }
}

describe("AggregateRoot", () => {
  it("starts with no domain events", () => {
    const aggregate = new TestAggregate({ name: "a" });

    expect(aggregate.domainEvents).toHaveLength(0);
  });

  it("collects events raised by behaviour", () => {
    const aggregate = new TestAggregate({ name: "a" });

    aggregate.doSomething();
    aggregate.doSomething();

    expect(aggregate.domainEvents).toHaveLength(2);
    expect(aggregate.domainEvents[0]?.eventName).toBe("test.happened");
  });

  it("clearDomainEvents empties the collection", () => {
    const aggregate = new TestAggregate({ name: "a" });
    aggregate.doSomething();

    aggregate.clearDomainEvents();

    expect(aggregate.domainEvents).toHaveLength(0);
  });

  it("domainEvents is a read-only snapshot, not the live array", () => {
    const aggregate = new TestAggregate({ name: "a" });
    aggregate.doSomething();

    const events = aggregate.domainEvents;
    aggregate.clearDomainEvents();

    expect(events).toHaveLength(1);
  });
});
