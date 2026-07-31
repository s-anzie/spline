import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { RuntimeCommand } from "../runtime-command";

export const RUNTIME_COMMAND_REPOSITORY = Symbol("RUNTIME_COMMAND_REPOSITORY");

export interface RuntimeCommandRepository {
  findById(id: UniqueEntityId): Promise<RuntimeCommand | null>;
  /** PENDING commands for a machine, oldest first — delivered on connect. */
  listPendingByMachine(machineId: string): Promise<RuntimeCommand[]>;
  save(command: RuntimeCommand): Promise<void>;
}
