import { ArtifactType } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { Artifact } from "../domain/artifact";
import { ArtifactArchivedError } from "../domain/artifact.errors";
import { ArtifactNotFoundError } from "./artifact-application.errors";
import { ArchiveArtifactUseCase } from "./archive-artifact.use-case";
import { InMemoryArtifactRepository } from "./testing/in-memory-artifact.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("ArchiveArtifactUseCase", () => {
  it("archives the artifact and publishes the event", async () => {
    const artifacts = new InMemoryArtifactRepository();
    const eventPublisher = new FakeEventPublisher();
    const artifact = Artifact.create({ workspaceId: "w1", type: ArtifactType.NOTE, name: "note.md", createdBy: HUMAN_1 });
    artifact.clearEvents();
    await artifacts.save(artifact);
    const useCase = new ArchiveArtifactUseCase(artifacts, eventPublisher);

    const result = await useCase.execute({ artifactId: artifact.id.toString(), updatedBy: HUMAN_1 });

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe("ARCHIVED");
    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["artifact.archived"]);
  });

  it("fails when the artifact does not exist", async () => {
    const useCase = new ArchiveArtifactUseCase(new InMemoryArtifactRepository(), new FakeEventPublisher());

    const result = await useCase.execute({ artifactId: "unknown", updatedBy: HUMAN_1 });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ArtifactNotFoundError);
  });

  it("fails when the artifact is already archived", async () => {
    const artifacts = new InMemoryArtifactRepository();
    const artifact = Artifact.create({ workspaceId: "w1", type: ArtifactType.NOTE, name: "note.md", createdBy: HUMAN_1 });
    artifact.archive(HUMAN_1);
    await artifacts.save(artifact);
    const useCase = new ArchiveArtifactUseCase(artifacts, new FakeEventPublisher());

    const result = await useCase.execute({ artifactId: artifact.id.toString(), updatedBy: HUMAN_1 });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ArtifactArchivedError);
  });
});
