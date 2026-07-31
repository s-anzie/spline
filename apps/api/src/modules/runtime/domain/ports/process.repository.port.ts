import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { Process } from "../process";

export const PROCESS_REPOSITORY = Symbol("PROCESS_REPOSITORY");

export interface ProcessRepository {
  findById(id: UniqueEntityId): Promise<Process | null>;
  listByWorkspace(workspaceId: string): Promise<Process[]>;
  /** Every Process currently RUNNING/STARTING/STOPPING — used by boot-time reconciliation. */
  listActive(): Promise<Process[]>;
  save(process: Process): Promise<void>;
}
