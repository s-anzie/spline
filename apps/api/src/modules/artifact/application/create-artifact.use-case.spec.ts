import { ArtifactType } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { GetGoalUseCase } from "../../goal/application/get-goal.use-case";
import { InMemoryGoalRepository } from "../../goal/application/testing/in-memory-goal.repository";
import { Goal } from "../../goal/domain/goal";
import { GetTaskUseCase } from "../../task/application/get-task.use-case";
import { InMemoryTaskRepository } from "../../task/application/testing/in-memory-task.repository";
import { Task } from "../../task/domain/task";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/in-memory-workspace.repository";
import { Workspace } from "../../workspace/domain/workspace";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { CreateArtifactUseCase } from "./create-artifact.use-case";
import { LinkedGoalNotInWorkspaceError, LinkedTaskNotInWorkspaceError } from "./artifact-application.errors";
import { InMemoryArtifactRepository } from "./testing/in-memory-artifact.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("CreateArtifactUseCase", () => {
  function setup() {
    const artifacts = new InMemoryArtifactRepository();
    const workspaces = new InMemoryWorkspaceRepository();
    const goals = new InMemoryGoalRepository();
    const tasks = new InMemoryTaskRepository();
    const eventPublisher = new FakeEventPublisher();
    const useCase = new CreateArtifactUseCase(
      artifacts,
      new GetWorkspaceUseCase(workspaces),
      new GetGoalUseCase(goals),
      new GetTaskUseCase(tasks),
      eventPublisher,
    );
    return { artifacts, workspaces, goals, tasks, eventPublisher, useCase };
  }

  it("creates an artifact within an existing workspace", async () => {
    const { artifacts, workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      type: ArtifactType.DIFF,
      name: "login.diff",
      createdBy: HUMAN_1,
    });

    expect(result.isSuccess).toBe(true);
    await expect(artifacts.findById(result.value.id)).resolves.not.toBeNull();
  });

  it("publishes ArtifactCreated", async () => {
    const { workspaces, eventPublisher, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);

    await useCase.execute({
      workspaceId: workspace.id.toString(),
      type: ArtifactType.NOTE,
      name: "note.md",
      createdBy: HUMAN_1,
    });

    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["artifact.created"]);
  });

  it("links to a goal and a task at creation when both belong to the workspace", async () => {
    const { workspaces, goals, tasks, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    await workspaces.save(workspace);
    const goal = Goal.create({ workspaceId: workspace.id.toString(), title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    await goals.save(goal);
    const task = Task.create({ workspaceId: workspace.id.toString(), title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    await tasks.save(task);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      goalId: goal.id.toString(),
      taskId: task.id.toString(),
      type: ArtifactType.DIFF,
      name: "login.diff",
      createdBy: HUMAN_1,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.goalId).toBe(goal.id.toString());
    expect(result.value.taskId).toBe(task.id.toString());
  });

  it("fails when the workspace does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({
      workspaceId: "unknown",
      type: ArtifactType.NOTE,
      name: "note.md",
      createdBy: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("fails when the goal belongs to a different workspace", async () => {
    const { workspaces, goals, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    const otherWorkspace = Workspace.create({ name: "Other" });
    await workspaces.save(workspace);
    await workspaces.save(otherWorkspace);
    const goal = Goal.create({ workspaceId: otherWorkspace.id.toString(), title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    await goals.save(goal);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      goalId: goal.id.toString(),
      type: ArtifactType.DIFF,
      name: "login.diff",
      createdBy: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(LinkedGoalNotInWorkspaceError);
  });

  it("fails when the task belongs to a different workspace", async () => {
    const { workspaces, tasks, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    const otherWorkspace = Workspace.create({ name: "Other" });
    await workspaces.save(workspace);
    await workspaces.save(otherWorkspace);
    const task = Task.create({ workspaceId: otherWorkspace.id.toString(), title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    await tasks.save(task);

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      taskId: task.id.toString(),
      type: ArtifactType.DIFF,
      name: "login.diff",
      createdBy: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(LinkedTaskNotInWorkspaceError);
  });
});
