import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { WorkspaceRepository } from "../../domain/ports/workspace.repository.port";
import { Workspace } from "../../domain/workspace";

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  private readonly workspaces = new Map<string, Workspace>();

  async findById(id: UniqueEntityId): Promise<Workspace | null> {
    return this.workspaces.get(id.toString()) ?? null;
  }

  async findByIds(ids: string[]): Promise<Workspace[]> {
    const idSet = new Set(ids);
    return [...this.workspaces.values()].filter((w) => idSet.has(w.id.toString()));
  }

  async save(workspace: Workspace): Promise<void> {
    this.workspaces.set(workspace.id.toString(), workspace);
  }
}
