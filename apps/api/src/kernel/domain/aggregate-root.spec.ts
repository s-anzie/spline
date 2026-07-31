import { AggregateRoot } from "./aggregate-root";
import { DomainEvent } from "./domain-event";

class DummyCreated extends DomainEvent {
  constructor() {
    super("workspace-1");
  }

  get eventName(): string {
    return "dummy.created";
  }
}

interface DummyProps {
  name: string;
}

class Dummy extends AggregateRoot<DummyProps> {
  static create(props: DummyProps): Dummy {
    const dummy = new Dummy(props);
    dummy.record(new DummyCreated());
    return dummy;
  }
}

describe("AggregateRoot", () => {
  it("records domain events raised during its lifecycle", () => {
    const dummy = Dummy.create({ name: "a" });

    expect(dummy.domainEvents).toHaveLength(1);
    expect(dummy.domainEvents[0]?.eventName).toBe("dummy.created");
  });

  it("clears recorded events once they have been dispatched", () => {
    const dummy = Dummy.create({ name: "a" });

    dummy.clearEvents();

    expect(dummy.domainEvents).toHaveLength(0);
  });

  it("does not let external mutation of the returned list affect internal state", () => {
    const dummy = Dummy.create({ name: "a" });

    const externalCopy = dummy.domainEvents as DomainEvent[];
    externalCopy.push(new DummyCreated());

    expect(dummy.domainEvents).toHaveLength(1);
  });
});
