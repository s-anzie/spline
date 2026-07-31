import { ArtifactType } from "@repo/db";

import { Artifact } from "../domain/artifact";
import { ListArtifactsUseCase } from "./list-artifacts.use-case";
import { InMemoryArtifactRepository } from "./testing/in-memory-artifact.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("ListArtifactsUseCase", () => {
  it("filters by workspace and optional goal/task/decision/process", async () => {
    const artifacts = new InMemoryArtifactRepository();
    const a = Artifact.create({ workspaceId: "w1", goalId: "g1", type: ArtifactType.NOTE, name: "A", createdBy: HUMAN_1 });
    const b = Artifact.create({ workspaceId: "w1", type: ArtifactType.NOTE, name: "B", createdBy: HUMAN_1 });
    const c = Artifact.create({ workspaceId: "w2", type: ArtifactType.NOTE, name: "C", createdBy: HUMAN_1 });
    await artifacts.save(a);
    await artifacts.save(b);
    await artifacts.save(c);
    const useCase = new ListArtifactsUseCase(artifacts);

    const all = await useCase.execute({ workspaceId: "w1" });
    const scoped = await useCase.execute({ workspaceId: "w1", goalId: "g1" });

    expect(all.map((x) => x.name).sort()).toEqual(["A", "B"]);
    expect(scoped.map((x) => x.name)).toEqual(["A"]);
  });
});
