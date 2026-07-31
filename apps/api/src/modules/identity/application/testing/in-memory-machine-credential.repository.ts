import { UniqueEntityId } from "../../../../kernel/domain/unique-entity-id";
import { MachineCredentialRepository } from "../../domain/ports/machine-credential.repository.port";
import { MachineCredential } from "../../domain/machine-credential";

export class InMemoryMachineCredentialRepository implements MachineCredentialRepository {
  private readonly credentials = new Map<string, MachineCredential>();

  async findById(id: UniqueEntityId): Promise<MachineCredential | null> {
    return this.credentials.get(id.toString()) ?? null;
  }

  async findByMachineId(machineId: string): Promise<MachineCredential | null> {
    for (const credential of this.credentials.values()) {
      if (credential.machineId === machineId) {
        return credential;
      }
    }
    return null;
  }

  async save(credential: MachineCredential): Promise<void> {
    this.credentials.set(credential.id.toString(), credential);
  }
}
