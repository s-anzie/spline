import { RuntimeCommandStatus } from "@repo/db";

import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { RuntimeCommandRepository } from "../../domain/ports/runtime-command.repository.port";
import { RuntimeCommand } from "../../domain/runtime-command";

export class InMemoryRuntimeCommandRepository implements RuntimeCommandRepository {
  private readonly commands = new Map<string, RuntimeCommand>();

  async findById(id: UniqueEntityId): Promise<RuntimeCommand | null> {
    return this.commands.get(id.toString()) ?? null;
  }

  async listPendingByMachine(machineId: string): Promise<RuntimeCommand[]> {
    return [...this.commands.values()]
      .filter((c) => c.machineId === machineId && c.status === RuntimeCommandStatus.PENDING)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listByWorkspace(workspaceId: string): Promise<RuntimeCommand[]> {
    return [...this.commands.values()]
      .filter((c) => c.workspaceId === workspaceId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async save(command: RuntimeCommand): Promise<void> {
    this.commands.set(command.id.toString(), command);
  }
}
