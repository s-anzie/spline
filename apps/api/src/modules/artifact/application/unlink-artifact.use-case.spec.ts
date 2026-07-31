import { ArtifactType } from "@repo/db";

import { Artifact } from "../domain/artifact";
import { ArtifactNotFoundError } from "./artifact-application.errors";
import { UnlinkArtifactUseCase } from "./unlink-artifact.use-case";
import { InMemoryArtifactRepository } from "./testing/in-memory-artifact.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("UnlinkArtifactUseCase", () => {
  it("removes the link to the target", async () => {
    const artifacts = new InMemoryArtifactRepository();
    const artifact = Artifact.create({ workspaceId: "w1", goalId: "g1", type: ArtifactType.NOTE, name: "note.md", createdBy: HUMAN_1 });
    await artifacts.save(artifact);
    const useCase = new UnlinkArtifactUseCase(artifacts);

    const result = await useCase.execute({
      artifactId: artifact.id.toString(),
      targetType: "goal",
      updatedBy: HUMAN_1,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.goalId).toBeUndefined();
  });

  it("fails when the artifact does not exist", async () => {
    const useCase = new UnlinkArtifactUseCase(new InMemoryArtifactRepository());

    const result = await useCase.execute({ artifactId: "unknown", targetType: "goal", updatedBy: HUMAN_1 });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ArtifactNotFoundError);
  });
});
