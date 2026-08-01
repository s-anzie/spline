import { EventReceiptStatus } from "@repo/db";

import { FakeClock } from "../../../kernel/testing/fake-clock";
import { Event } from "../domain/event";
import { InMemoryEventRepository } from "./testing/in-memory-event.repository";
import { InMemoryEventReceiptRepository } from "./testing/in-memory-event-receipt.repository";
import { EventNotFoundError } from "./event-application.errors";
import { RecordEventReceiptUseCase } from "./record-event-receipt.use-case";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const AGENT_1 = { type: "AGENT" as const, id: "agent-1" };
const NOW = new Date("2026-07-31T10:00:00Z");

async function setup() {
  const events = new InMemoryEventRepository();
  const receipts = new InMemoryEventReceiptRepository();
  const clock = new FakeClock(NOW);

  const event = Event.record({ workspaceId: "w1", type: "agent.validation_request", actor: HUMAN_1 });
  await events.save(event);

  const useCase = new RecordEventReceiptUseCase(receipts, events, clock);

  return { event, events, receipts, useCase };
}

describe("RecordEventReceiptUseCase", () => {
  it("creates a new receipt at SEEN when the actor has none yet", async () => {
    const { event, receipts, useCase } = await setup();

    const result = await useCase.execute({
      eventId: event.id.toString(),
      actor: AGENT_1,
      status: EventReceiptStatus.SEEN,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(EventReceiptStatus.SEEN);
    const persisted = await receipts.findByEventAndActor(event.id.toString(), "AGENT", "agent-1");
    expect(persisted).not.toBeNull();
  });

  it("advances an existing receipt instead of creating a duplicate row", async () => {
    const { event, receipts, useCase } = await setup();
    await useCase.execute({ eventId: event.id.toString(), actor: AGENT_1, status: EventReceiptStatus.SEEN });

    const result = await useCase.execute({
      eventId: event.id.toString(),
      actor: AGENT_1,
      status: EventReceiptStatus.ACKNOWLEDGED,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(EventReceiptStatus.ACKNOWLEDGED);
    expect(await receipts.listByEvent(event.id.toString())).toHaveLength(1);
  });

  it("distinguishes receipts by actor — one agent's receipt does not affect another's", async () => {
    const { event, receipts, useCase } = await setup();
    await useCase.execute({ eventId: event.id.toString(), actor: AGENT_1, status: EventReceiptStatus.ACKNOWLEDGED });

    await useCase.execute({ eventId: event.id.toString(), actor: HUMAN_1, status: EventReceiptStatus.SEEN });

    const all = await receipts.listByEvent(event.id.toString());
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.actorId === "agent-1")?.status).toBe(EventReceiptStatus.ACKNOWLEDGED);
    expect(all.find((r) => r.actorId === "user-1")?.status).toBe(EventReceiptStatus.SEEN);
  });

  it("fails when the event does not exist", async () => {
    const { useCase } = await setup();

    const result = await useCase.execute({ eventId: "unknown", actor: AGENT_1, status: EventReceiptStatus.SEEN });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EventNotFoundError);
  });
});
