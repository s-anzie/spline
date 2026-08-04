import { WorkspaceRepository } from "../../domain/ports/workspace.repository.port";
import { Workspace } from "../../domain/workspace";

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  readonly workspaces = new Map<string, Workspace>();

  async save(workspace: Workspace): Promise<void> {
    this.workspaces.set(workspace.id.value, workspace);
  }

  async findById(id: string): Promise<Workspace | null> {
    return this.workspaces.get(id) ?? null;
  }

  async listByIds(ids: readonly string[]): Promise<Workspace[]> {
    return ids
      .map((id) => this.workspaces.get(id))
      .filter((workspace): workspace is Workspace => workspace !== undefined);
  }

  async delete(id: string): Promise<void> {
    this.workspaces.delete(id);
  }
}
