import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { MachineCredential } from "../machine-credential";

export const MACHINE_CREDENTIAL_REPOSITORY = Symbol("MACHINE_CREDENTIAL_REPOSITORY");

export interface MachineCredentialRepository {
  findById(id: UniqueEntityId): Promise<MachineCredential | null>;
  findByMachineId(machineId: string): Promise<MachineCredential | null>;
  save(credential: MachineCredential): Promise<void>;
}
