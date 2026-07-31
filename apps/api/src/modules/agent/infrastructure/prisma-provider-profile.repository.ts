import { Injectable } from "@nestjs/common";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { ProviderProfile } from "../domain/provider-profile";
import { ProviderProfileRepository } from "../domain/ports/provider-profile.repository.port";
import { ProviderProfileMapper } from "./provider-profile.mapper";

@Injectable()
export class PrismaProviderProfileRepository implements ProviderProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UniqueEntityId): Promise<ProviderProfile | null> {
    const record = await this.prisma.providerProfile.findUnique({ where: { id: id.toString() } });
    return record ? ProviderProfileMapper.toDomain(record) : null;
  }

  async findByProvider(provider: string): Promise<ProviderProfile | null> {
    const record = await this.prisma.providerProfile.findUnique({ where: { provider } });
    return record ? ProviderProfileMapper.toDomain(record) : null;
  }

  async list(): Promise<ProviderProfile[]> {
    const records = await this.prisma.providerProfile.findMany({ orderBy: { provider: "asc" } });
    return records.map(ProviderProfileMapper.toDomain);
  }

  async save(profile: ProviderProfile): Promise<void> {
    const data = ProviderProfileMapper.toPersistence(profile);
    await this.prisma.providerProfile.upsert({
      where: { id: data.id },
      create: data,
      update: {
        capabilities: data.capabilities,
        promptFormat: data.promptFormat,
        approvalRules: data.approvalRules,
        hookSupport: data.hookSupport,
        sandboxModel: data.sandboxModel,
        outputSchema: data.outputSchema,
        updatedAt: data.updatedAt,
      },
    });
  }
}
