import { ProcessStatus } from "@repo/db";

import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { ProcessRepository } from "../../domain/ports/process.repository.port";
import { Process } from "../../domain/process";

const ACTIVE_STATUSES: ProcessStatus[] = [
  ProcessStatus.STARTING,
  ProcessStatus.RUNNING,
  ProcessStatus.STOPPING,
];

export class InMemoryProcessRepository implements ProcessRepository {
  private readonly processes = new Map<string, Process>();

  async findById(id: UniqueEntityId): Promise<Process | null> {
    return this.processes.get(id.toString()) ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<Process[]> {
    return [...this.processes.values()].filter((p) => p.workspaceId === workspaceId);
  }

  async listActive(): Promise<Process[]> {
    return [...this.processes.values()].filter((p) => ACTIVE_STATUSES.includes(p.status));
  }

  async save(process: Process): Promise<void> {
    this.processes.set(process.id.toString(), process);
  }
}
