import { Artifact } from "../../domain/artifact";
import {
  ArtifactRepository,
  ListArtifactsFilter,
} from "../../domain/ports/artifact.repository.port";

export class InMemoryArtifactRepository implements ArtifactRepository {
  readonly artifacts = new Map<string, Artifact>();

  async save(artifact: Artifact): Promise<void> {
    this.artifacts.set(artifact.id.value, artifact);
  }

  async findById(id: string): Promise<Artifact | null> {
    return this.artifacts.get(id) ?? null;
  }

  async list(filter: ListArtifactsFilter): Promise<Artifact[]> {
    return [...this.artifacts.values()].filter((artifact) => {
      if (artifact.workspaceId !== filter.workspaceId) return false;
      if (filter.type !== undefined && artifact.type !== filter.type) return false;
      if (filter.goalId !== undefined && artifact.goalId !== filter.goalId) return false;
      if (filter.taskId !== undefined && artifact.taskId !== filter.taskId) return false;
      if (
        filter.repositoryId !== undefined &&
        artifact.repositoryId !== filter.repositoryId
      ) {
        return false;
      }
      if (filter.createdBy && !artifact.createdBy.equals(filter.createdBy)) return false;
      if (filter.tags?.length && !filter.tags.every((tag) => artifact.tags.includes(tag))) {
        return false;
      }
      if (filter.statuses && !filter.statuses.includes(artifact.status)) return false;
      if (filter.createdAfter && artifact.createdAt < filter.createdAfter) return false;
      if (filter.createdBefore && artifact.createdAt > filter.createdBefore) return false;
      return true;
    });
  }
}
