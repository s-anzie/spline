import { BaseDomainEvent } from "./base-domain-event";

class WorkspaceCreated extends BaseDomainEvent {
  readonly eventName = "workspace.created";

  constructor(aggregateId: string, occurredAt: Date) {
    super(aggregateId, occurredAt);
  }
}

describe("BaseDomainEvent", () => {
  it("carries the aggregate id and the injected occurrence time", () => {
    const occurredAt = new Date("2026-08-04T09:00:00.000Z");

    const event = new WorkspaceCreated("w-1", occurredAt);

    expect(event.aggregateId).toBe("w-1");
    expect(event.occurredAt).toEqual(occurredAt);
    expect(event.eventName).toBe("workspace.created");
  });

  it("copies the date so later mutation of the input cannot rewrite history", () => {
    const input = new Date("2026-08-04T09:00:00.000Z");
    const event = new WorkspaceCreated("w-1", input);

    input.setFullYear(1999);

    expect(event.occurredAt.getFullYear()).toBe(2026);
  });
});
