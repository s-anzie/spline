import { Event } from "../domain/event";
import { InMemoryEventRepository } from "./testing/in-memory-event.repository";
import { ListEventsByWorkspaceUseCase } from "./list-events-by-workspace.use-case";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("ListEventsByWorkspaceUseCase", () => {
  it("lists only events belonging to the given workspace", async () => {
    const events = new InMemoryEventRepository();
    await events.save(Event.record({ workspaceId: "w1", type: "agent.intention", actor: HUMAN_1 }));
    await events.save(Event.record({ workspaceId: "w1", type: "agent.blocker", actor: HUMAN_1 }));
    await events.save(Event.record({ workspaceId: "w2", type: "agent.intention", actor: HUMAN_1 }));
    const useCase = new ListEventsByWorkspaceUseCase(events);

    const result = await useCase.execute("w1");

    expect(result.map((e) => e.type).sort()).toEqual(["agent.blocker", "agent.intention"]);
  });
});
