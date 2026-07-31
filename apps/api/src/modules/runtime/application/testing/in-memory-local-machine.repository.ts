import { LocalMachineRuntimeStatus } from "@repo/db";

import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { LocalMachineRepository } from "../../domain/ports/local-machine.repository.port";
import { LocalMachine } from "../../domain/local-machine";

export class InMemoryLocalMachineRepository implements LocalMachineRepository {
  private readonly machines = new Map<string, LocalMachine>();

  async findById(id: UniqueEntityId): Promise<LocalMachine | null> {
    return this.machines.get(id.toString()) ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<LocalMachine[]> {
    return [...this.machines.values()].filter((m) => m.workspaceIds.includes(workspaceId));
  }

  async listActive(): Promise<LocalMachine[]> {
    return [...this.machines.values()].filter(
      (m) => m.runtimeStatus !== LocalMachineRuntimeStatus.OFFLINE,
    );
  }

  async save(machine: LocalMachine): Promise<void> {
    this.machines.set(machine.id.toString(), machine);
  }
}
