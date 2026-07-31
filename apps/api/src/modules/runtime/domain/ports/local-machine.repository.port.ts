import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { LocalMachine } from "../local-machine";

export const LOCAL_MACHINE_REPOSITORY = Symbol("LOCAL_MACHINE_REPOSITORY");

export interface LocalMachineRepository {
  findById(id: UniqueEntityId): Promise<LocalMachine | null>;
  listByWorkspace(workspaceId: string): Promise<LocalMachine[]>;
  /** Every machine not OFFLINE — used by boot-time reconciliation. */
  listActive(): Promise<LocalMachine[]>;
  save(machine: LocalMachine): Promise<void>;
}
