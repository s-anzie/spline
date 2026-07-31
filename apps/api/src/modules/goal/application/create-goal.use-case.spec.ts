import { Priority } from "@repo/db";

import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/in-memory-workspace.repository";
import { Workspace } from "../../workspace/domain/workspace";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { EmptyGoalTitleError } from "../domain/goal.errors";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { CreateGoalUseCase } from "./create-goal.use-case";
import { InMemoryGoalRepository } from "./testing/in-memory-goal.repository";

describe("CreateGoalUseCase", () => {
  function setup() {
    const goals = new InMemoryGoalRepository();
    const workspaces = new InMemoryWorkspaceRepository();
    const getWorkspace = new GetWorkspaceUseCase(workspaces);
    const eventPublisher = new FakeEventPublisher();
    const useCase = new CreateGoalUseCase(goals, getWorkspace, eventPublisher);
    return { goals, workspaces, eventPublisher, useCase };
  }

  it("creates a goal within an existing workspace", async () => {
    const { goals, workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      title: "Ship the MVP",
      priority: Priority.HIGH,
      ownerType: "HUMAN",
      ownerId: "user-1",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.priority).toBe(Priority.HIGH);
    await expect(goals.findById(result.value.id)).resolves.not.toBeNull();
  });

  it("publishes the GoalCreated domain event", async () => {
    const { workspaces, eventPublisher, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    await useCase.execute({
      workspaceId: workspace.id.toString(),
      title: "Ship the MVP",
      ownerType: "HUMAN",
      ownerId: "user-1",
    });

    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["goal.created"]);
  });

  it("fails when the workspace does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({
      workspaceId: "unknown",
      title: "Ship the MVP",
      ownerType: "HUMAN",
      ownerId: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("fails when the title is empty", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      title: "   ",
      ownerType: "HUMAN",
      ownerId: "user-1",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyGoalTitleError);
  });
});
