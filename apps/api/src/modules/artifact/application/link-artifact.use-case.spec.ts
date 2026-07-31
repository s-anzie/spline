import { ArtifactType } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { GetGoalUseCase } from "../../goal/application/get-goal.use-case";
import { InMemoryGoalRepository } from "../../goal/application/testing/in-memory-goal.repository";
import { Goal } from "../../goal/domain/goal";
import { GetTaskUseCase } from "../../task/application/get-task.use-case";
import { InMemoryTaskRepository } from "../../task/application/testing/in-memory-task.repository";
import { Task } from "../../task/domain/task";
import { Artifact } from "../domain/artifact";
import { ArtifactNotFoundError, LinkedGoalNotInWorkspaceError } from "./artifact-application.errors";
import { LinkArtifactUseCase } from "./link-artifact.use-case";
import { InMemoryArtifactRepository } from "./testing/in-memory-artifact.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("LinkArtifactUseCase", () => {
  function setup() {
    const artifacts = new InMemoryArtifactRepository();
    const goals = new InMemoryGoalRepository();
    const tasks = new InMemoryTaskRepository();
    const eventPublisher = new FakeEventPublisher();
    const useCase = new LinkArtifactUseCase(
      artifacts,
      new GetGoalUseCase(goals),
      new GetTaskUseCase(tasks),
      eventPublisher,
    );
    return { artifacts, goals, tasks, eventPublisher, useCase };
  }

  it("links an artifact to a goal in the same workspace", async () => {
    const { artifacts, goals, useCase } = setup();
    const goal = Goal.create({ workspaceId: "w1", title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    await goals.save(goal);
    const artifact = Artifact.create({ workspaceId: "w1", type: ArtifactType.NOTE, name: "note.md", createdBy: HUMAN_1 });
    await artifacts.save(artifact);

    const result = await useCase.execute({
      artifactId: artifact.id.toString(),
      targetType: "goal",
      targetId: goal.id.toString(),
      updatedBy: HUMAN_1,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.goalId).toBe(goal.id.toString());
  });

  it("links an artifact to a task", async () => {
    const { artifacts, tasks, useCase } = setup();
    const task = Task.create({ workspaceId: "w1", title: "Do it", createdByType: "HUMAN", createdById: "u1" });
    await tasks.save(task);
    const artifact = Artifact.create({ workspaceId: "w1", type: ArtifactType.NOTE, name: "note.md", createdBy: HUMAN_1 });
    await artifacts.save(artifact);

    const result = await useCase.execute({
      artifactId: artifact.id.toString(),
      targetType: "task",
      targetId: task.id.toString(),
      updatedBy: HUMAN_1,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.taskId).toBe(task.id.toString());
  });

  it("links an artifact to a decision or process without cross-module validation (not built yet)", async () => {
    const { artifacts, useCase } = setup();
    const artifact = Artifact.create({ workspaceId: "w1", type: ArtifactType.NOTE, name: "note.md", createdBy: HUMAN_1 });
    await artifacts.save(artifact);

    const result = await useCase.execute({
      artifactId: artifact.id.toString(),
      targetType: "decision",
      targetId: "decision-1",
      updatedBy: HUMAN_1,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.decisionId).toBe("decision-1");
  });

  it("fails when the goal belongs to a different workspace", async () => {
    const { artifacts, goals, useCase } = setup();
    const goal = Goal.create({ workspaceId: "w2", title: "Ship it", ownerType: "HUMAN", ownerId: "u1" });
    await goals.save(goal);
    const artifact = Artifact.create({ workspaceId: "w1", type: ArtifactType.NOTE, name: "note.md", createdBy: HUMAN_1 });
    await artifacts.save(artifact);

    const result = await useCase.execute({
      artifactId: artifact.id.toString(),
      targetType: "goal",
      targetId: goal.id.toString(),
      updatedBy: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(LinkedGoalNotInWorkspaceError);
  });

  it("fails when the artifact does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute({
      artifactId: "unknown",
      targetType: "decision",
      targetId: "decision-1",
      updatedBy: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ArtifactNotFoundError);
  });
});
