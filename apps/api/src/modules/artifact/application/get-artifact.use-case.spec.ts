import { ArtifactType } from "@repo/db";

import { Artifact } from "../domain/artifact";
import { ArtifactNotFoundError } from "./artifact-application.errors";
import { GetArtifactUseCase } from "./get-artifact.use-case";
import { InMemoryArtifactRepository } from "./testing/in-memory-artifact.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("GetArtifactUseCase", () => {
  it("returns the artifact when it exists", async () => {
    const artifacts = new InMemoryArtifactRepository();
    const artifact = Artifact.create({ workspaceId: "w1", type: ArtifactType.NOTE, name: "note.md", createdBy: HUMAN_1 });
    await artifacts.save(artifact);
    const useCase = new GetArtifactUseCase(artifacts);

    const result = await useCase.execute(artifact.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.name).toBe("note.md");
  });

  it("fails when the artifact does not exist", async () => {
    const useCase = new GetArtifactUseCase(new InMemoryArtifactRepository());

    const result = await useCase.execute("unknown");

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ArtifactNotFoundError);
  });
});
