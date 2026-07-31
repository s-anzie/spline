import { MachineCredential as PrismaMachineCredential } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { MachineCredential } from "../domain/machine-credential";

export class MachineCredentialMapper {
  static toDomain(record: PrismaMachineCredential): MachineCredential {
    return MachineCredential.create(
      {
        machineId: record.machineId,
        tokenHash: record.tokenHash,
        createdAt: record.createdAt,
        revokedAt: record.revokedAt ?? undefined,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(credential: MachineCredential): PrismaMachineCredential {
    return {
      id: credential.id.toString(),
      machineId: credential.machineId,
      tokenHash: credential.tokenHash,
      createdAt: credential.createdAt,
      revokedAt: credential.revokedAt ?? null,
    };
  }
}
