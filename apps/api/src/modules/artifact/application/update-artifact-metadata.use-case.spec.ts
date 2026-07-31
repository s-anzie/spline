import { ArtifactType } from "@repo/db";

import { Artifact } from "../domain/artifact";
import { ArtifactArchivedError } from "../domain/artifact.errors";
import { ArtifactNotFoundError } from "./artifact-application.errors";
import { UpdateArtifactMetadataUseCase } from "./update-artifact-metadata.use-case";
import { InMemoryArtifactRepository } from "./testing/in-memory-artifact.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("UpdateArtifactMetadataUseCase", () => {
  it("updates the metadata of an existing artifact", async () => {
    const artifacts = new InMemoryArtifactRepository();
    const artifact = Artifact.create({ workspaceId: "w1", type: ArtifactType.NOTE, name: "Old", createdBy: HUMAN_1 });
    await artifacts.save(artifact);
    const useCase = new UpdateArtifactMetadataUseCase(artifacts);

    const result = await useCase.execute({
      artifactId: artifact.id.toString(),
      name: "New",
      updatedBy: HUMAN_1,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.name).toBe("New");
  });

  it("fails when the artifact does not exist", async () => {
    const useCase = new UpdateArtifactMetadataUseCase(new InMemoryArtifactRepository());

    const result = await useCase.execute({ artifactId: "unknown", name: "New", updatedBy: HUMAN_1 });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ArtifactNotFoundError);
  });

  it("fails when the artifact is archived", async () => {
    const artifacts = new InMemoryArtifactRepository();
    const artifact = Artifact.create({ workspaceId: "w1", type: ArtifactType.NOTE, name: "Old", createdBy: HUMAN_1 });
    artifact.archive(HUMAN_1);
    await artifacts.save(artifact);
    const useCase = new UpdateArtifactMetadataUseCase(artifacts);

    const result = await useCase.execute({ artifactId: artifact.id.toString(), name: "New", updatedBy: HUMAN_1 });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ArtifactArchivedError);
  });
});
