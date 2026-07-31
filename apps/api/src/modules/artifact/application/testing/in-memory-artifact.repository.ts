import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import {
  ArtifactListFilter,
  ArtifactRepository,
} from "../../domain/ports/artifact.repository.port";
import { Artifact } from "../../domain/artifact";

export class InMemoryArtifactRepository implements ArtifactRepository {
  private readonly artifacts = new Map<string, Artifact>();

  async findById(id: UniqueEntityId): Promise<Artifact | null> {
    return this.artifacts.get(id.toString()) ?? null;
  }

  async list(filter: ArtifactListFilter): Promise<Artifact[]> {
    return [...this.artifacts.values()].filter(
      (a) =>
        a.workspaceId === filter.workspaceId &&
        (filter.goalId === undefined || a.goalId === filter.goalId) &&
        (filter.taskId === undefined || a.taskId === filter.taskId) &&
        (filter.decisionId === undefined || a.decisionId === filter.decisionId) &&
        (filter.processId === undefined || a.processId === filter.processId),
    );
  }

  async save(artifact: Artifact): Promise<void> {
    this.artifacts.set(artifact.id.toString(), artifact);
  }

  async delete(id: UniqueEntityId): Promise<void> {
    this.artifacts.delete(id.toString());
  }
}
