import { Event } from "../domain/event";
import { EventNotFoundError } from "./event-application.errors";
import { GetEventUseCase } from "./get-event.use-case";
import { InMemoryEventRepository } from "./testing/in-memory-event.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("GetEventUseCase", () => {
  it("returns the event by id", async () => {
    const events = new InMemoryEventRepository();
    const event = Event.record({ workspaceId: "w1", type: "agent.intention", actor: HUMAN_1 });
    await events.save(event);
    const useCase = new GetEventUseCase(events);

    const result = await useCase.execute(event.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.type).toBe("agent.intention");
  });

  it("fails when the event does not exist", async () => {
    const events = new InMemoryEventRepository();
    const useCase = new GetEventUseCase(events);

    const result = await useCase.execute("unknown");

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EventNotFoundError);
  });
});
