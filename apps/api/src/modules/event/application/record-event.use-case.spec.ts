import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/in-memory-workspace.repository";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { Workspace } from "../../workspace/domain/workspace";
import { EmptyEventTypeError } from "../domain/event.errors";
import { InMemoryEventRepository } from "./testing/in-memory-event.repository";
import { RecordEventUseCase } from "./record-event.use-case";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const NOW = new Date("2026-07-31T10:00:00Z");

async function setup() {
  const events = new InMemoryEventRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const clock = new FakeClock(NOW);
  const eventPublisher = new FakeEventPublisher();

  const workspace = Workspace.create({ name: "My Project" });
  await workspaces.save(workspace);

  const useCase = new RecordEventUseCase(events, new GetWorkspaceUseCase(workspaces), clock, eventPublisher);

  return { workspace, events, eventPublisher, useCase };
}

describe("RecordEventUseCase", () => {
  it("records an event, persists it, and publishes its domain events", async () => {
    const { workspace, events, eventPublisher, useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      type: "agent.intention",
      actor: HUMAN_1,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.type).toBe("agent.intention");
    expect(result.value.createdAt).toEqual(NOW);

    const persisted = await events.findById(result.value.id);
    expect(persisted).not.toBeNull();
    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["event.recorded"]);
  });

  it("fails when the workspace does not exist", async () => {
    const { useCase } = await setup();

    const result = await useCase.execute({ workspaceId: "unknown", type: "agent.intention", actor: HUMAN_1 });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("fails on an empty type", async () => {
    const { workspace, useCase } = await setup();

    const result = await useCase.execute({ workspaceId: workspace.id.toString(), type: "  ", actor: HUMAN_1 });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyEventTypeError);
  });
});
