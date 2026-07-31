import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { MachineCredentialRepository } from "../domain/ports/machine-credential.repository.port";
import { MachineCredential } from "../domain/machine-credential";
import { MachineCredentialMapper } from "./machine-credential.mapper";

@Injectable()
export class PrismaMachineCredentialRepository implements MachineCredentialRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<MachineCredential | null> {
    const record = await this.prisma.machineCredential.findUnique({ where: { id: id.toString() } });
    return record ? MachineCredentialMapper.toDomain(record) : null;
  }

  async findByMachineId(machineId: string): Promise<MachineCredential | null> {
    const record = await this.prisma.machineCredential.findUnique({ where: { machineId } });
    return record ? MachineCredentialMapper.toDomain(record) : null;
  }

  async save(credential: MachineCredential): Promise<void> {
    const data = MachineCredentialMapper.toPersistence(credential);
    await this.prisma.machineCredential.upsert({
      where: { id: data.id },
      create: data,
      update: { tokenHash: data.tokenHash, revokedAt: data.revokedAt },
    });
  }
}
