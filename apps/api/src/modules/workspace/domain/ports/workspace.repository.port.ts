import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { Workspace } from "../workspace";

export const WORKSPACE_REPOSITORY = Symbol("WORKSPACE_REPOSITORY");

export interface WorkspaceRepository {
  findById(id: UniqueEntityId): Promise<Workspace | null>;
  findByIds(ids: string[]): Promise<Workspace[]>;
  save(workspace: Workspace): Promise<void>;
}
