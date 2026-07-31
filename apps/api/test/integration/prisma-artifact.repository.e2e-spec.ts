import { ArtifactType } from "@repo/db";

import { PrismaArtifactRepository } from "../../src/modules/artifact/infrastructure/prisma-artifact.repository";
import { Artifact } from "../../src/modules/artifact/domain/artifact";
import { PrismaService } from "../../src/prisma/prisma.service";
import { UniqueEntityId } from "../../src/kernel/domain/unique-entity-id";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("PrismaArtifactRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaArtifactRepository;
  let workspaceId: string;
  let goalId: string;
  let taskId: string;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaArtifactRepository(prisma);
  });

  beforeEach(async () => {
    const workspace = await prisma.workspace.create({ data: { name: "Test workspace" } });
    workspaceId = workspace.id;
    const goal = await prisma.goal.create({
      data: { workspaceId, title: "Goal", ownerType: "HUMAN", ownerId: "user-1" },
    });
    goalId = goal.id;
    const task = await prisma.task.create({
      data: { workspaceId, title: "Task", createdByType: "HUMAN", createdById: "user-1" },
    });
    taskId = task.id;
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists an artifact and finds it back by id", async () => {
    const artifact = Artifact.create({
      workspaceId,
      goalId,
      type: ArtifactType.DIFF,
      name: "login.diff",
      createdBy: HUMAN_1,
    });

    await repository.save(artifact);
    const found = await repository.findById(artifact.id);

    expect(found?.name).toBe("login.diff");
    expect(found?.goalId).toBe(goalId);
    expect(found?.type).toBe(ArtifactType.DIFF);
    expect(found?.version).toBe(1);
    expect(found?.versions).toHaveLength(1);
  });

  it("returns null for an unknown id", async () => {
    await expect(repository.findById(UniqueEntityId.create())).resolves.toBeNull();
  });

  it("lists artifacts filtered by workspace and goal/task", async () => {
    await repository.save(
      Artifact.create({ workspaceId, goalId, type: ArtifactType.NOTE, name: "With goal", createdBy: HUMAN_1 }),
    );
    await repository.save(
      Artifact.create({ workspaceId, taskId, type: ArtifactType.NOTE, name: "With task", createdBy: HUMAN_1 }),
    );
    await repository.save(
      Artifact.create({ workspaceId, type: ArtifactType.NOTE, name: "Unlinked", createdBy: HUMAN_1 }),
    );

    const all = await repository.list({ workspaceId });
    const scopedToGoal = await repository.list({ workspaceId, goalId });

    expect(all).toHaveLength(3);
    expect(scopedToGoal.map((a) => a.name)).toEqual(["With goal"]);
  });

  it("persists metadata, version and link changes on save", async () => {
    const artifact = Artifact.create({ workspaceId, type: ArtifactType.NOTE, name: "note.md", createdBy: HUMAN_1 });
    await repository.save(artifact);

    artifact.updateMetadata({ name: "renamed.md" }, HUMAN_1);
    artifact.addVersion({ contentRef: "s3://bucket/v2.md" }, HUMAN_1);
    artifact.linkTo("goal", goalId, HUMAN_1);
    await repository.save(artifact);

    const found = await repository.findById(artifact.id);
    expect(found?.name).toBe("renamed.md");
    expect(found?.version).toBe(2);
    expect(found?.versions).toHaveLength(2);
    expect(found?.goalId).toBe(goalId);
    expect(found?.updatedByType).toBe("HUMAN");
    expect(found?.updatedById).toBe("user-1");
  });

  it("deletes an artifact", async () => {
    const artifact = Artifact.create({ workspaceId, type: ArtifactType.NOTE, name: "note.md", createdBy: HUMAN_1 });
    await repository.save(artifact);

    await repository.delete(artifact.id);

    await expect(repository.findById(artifact.id)).resolves.toBeNull();
  });
});
