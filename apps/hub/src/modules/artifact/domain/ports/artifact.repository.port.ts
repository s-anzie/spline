import { ActorRef } from "../../../identity/domain/actor";
import { Artifact, ArtifactStatus } from "../artifact";

/**
 * §15.6 — the seven search axes, present from the first version because the
 * Memory System (§16.10) and Audit (§18.7) will both read through them.
 * Narrowing this to findByTaskId would mean widening it six times later.
 */
export interface ListArtifactsFilter {
  workspaceId: string;
  type?: string;
  goalId?: string;
  taskId?: string;
  repositoryId?: string;
  createdBy?: ActorRef;
  tags?: readonly string[];
  statuses?: readonly ArtifactStatus[];
  createdAfter?: Date;
  createdBefore?: Date;
  /** Absent means one page, never the whole table (kernel pagination). */
  limit?: number;
}

export interface ArtifactRepository {
  save(artifact: Artifact): Promise<void>;
  findById(id: string): Promise<Artifact | null>;
  list(filter: ListArtifactsFilter): Promise<Artifact[]>;
}
export const ARTIFACT_REPOSITORY = "artifact/ArtifactRepository";
