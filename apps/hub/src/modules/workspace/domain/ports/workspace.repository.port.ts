import { Workspace } from "../workspace";

export interface WorkspaceRepository {
  save(workspace: Workspace): Promise<void>;
  findById(id: string): Promise<Workspace | null>;
  listByIds(ids: readonly string[]): Promise<Workspace[]>;
  /**
   * Physical removal — used ONLY as the compensation step when the OWNER
   * membership could not be granted right after creation. Normal deletion
   * is the logical DELETED status, never this.
   */
  delete(id: string): Promise<void>;
}
export const WORKSPACE_REPOSITORY = "workspace/WorkspaceRepository";
