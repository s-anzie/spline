import { ArtifactType } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { Artifact } from "../domain/artifact";
import { ArtifactNotFoundError } from "./artifact-application.errors";
import { DeleteArtifactUseCase } from "./delete-artifact.use-case";
import { InMemoryArtifactRepository } from "./testing/in-memory-artifact.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("DeleteArtifactUseCase", () => {
  it("deletes the artifact and publishes the event", async () => {
    const artifacts = new InMemoryArtifactRepository();
    const eventPublisher = new FakeEventPublisher();
    const artifact = Artifact.create({ workspaceId: "w1", type: ArtifactType.NOTE, name: "note.md", createdBy: HUMAN_1 });
    await artifacts.save(artifact);
    const useCase = new DeleteArtifactUseCase(artifacts, eventPublisher);

    const result = await useCase.execute(artifact.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(await artifacts.findById(artifact.id)).toBeNull();
    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["artifact.deleted"]);
  });

  it("fails when the artifact does not exist", async () => {
    const useCase = new DeleteArtifactUseCase(new InMemoryArtifactRepository(), new FakeEventPublisher());

    const result = await useCase.execute("unknown");

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ArtifactNotFoundError);
  });
});
