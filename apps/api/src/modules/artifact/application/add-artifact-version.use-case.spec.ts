import { ArtifactType } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { Artifact } from "../domain/artifact";
import { ArtifactNotFoundError } from "./artifact-application.errors";
import { AddArtifactVersionUseCase } from "./add-artifact-version.use-case";
import { InMemoryArtifactRepository } from "./testing/in-memory-artifact.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("AddArtifactVersionUseCase", () => {
  it("bumps the version and publishes the event", async () => {
    const artifacts = new InMemoryArtifactRepository();
    const eventPublisher = new FakeEventPublisher();
    const artifact = Artifact.create({ workspaceId: "w1", type: ArtifactType.DIFF, name: "a.diff", createdBy: HUMAN_1 });
    artifact.clearEvents();
    await artifacts.save(artifact);
    const useCase = new AddArtifactVersionUseCase(artifacts, eventPublisher);

    const result = await useCase.execute({
      artifactId: artifact.id.toString(),
      contentRef: "s3://bucket/v2.diff",
      updatedBy: HUMAN_1,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.version).toBe(2);
    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["artifact.versioned"]);
  });

  it("fails when the artifact does not exist", async () => {
    const useCase = new AddArtifactVersionUseCase(
      new InMemoryArtifactRepository(),
      new FakeEventPublisher(),
    );

    const result = await useCase.execute({ artifactId: "unknown", updatedBy: HUMAN_1 });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ArtifactNotFoundError);
  });
});
