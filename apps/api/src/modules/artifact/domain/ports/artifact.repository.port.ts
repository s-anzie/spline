import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { Artifact } from "../artifact";

export const ARTIFACT_REPOSITORY = Symbol("ARTIFACT_REPOSITORY");

export interface ArtifactListFilter {
  workspaceId: string;
  goalId?: string;
  taskId?: string;
  decisionId?: string;
  processId?: string;
}

export interface ArtifactRepository {
  findById(id: UniqueEntityId): Promise<Artifact | null>;
  list(filter: ArtifactListFilter): Promise<Artifact[]>;
  save(artifact: Artifact): Promise<void>;
  delete(id: UniqueEntityId): Promise<void>;
}
