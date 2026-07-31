import { ProviderProfile as PrismaProviderProfile, Prisma } from "@repo/db";

import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ProviderProfile } from "../domain/provider-profile";

export interface ProviderProfilePersistenceData {
  id: string;
  provider: string;
  capabilities: Prisma.InputJsonValue;
  promptFormat: Prisma.InputJsonValue;
  approvalRules: Prisma.InputJsonValue;
  hookSupport: Prisma.InputJsonValue;
  sandboxModel: PrismaProviderProfile["sandboxModel"];
  outputSchema: Prisma.InputJsonValue;
  createdAt: Date;
  updatedAt: Date;
}

export class ProviderProfileMapper {
  static toDomain(record: PrismaProviderProfile): ProviderProfile {
    return ProviderProfile.reconstitute(
      {
        provider: record.provider,
        capabilities: record.capabilities as string[],
        promptFormat: record.promptFormat as Record<string, unknown>,
        approvalRules: record.approvalRules as Record<string, unknown>,
        hookSupport: record.hookSupport as string[],
        sandboxModel: record.sandboxModel,
        outputSchema: record.outputSchema as Record<string, unknown>,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      UniqueEntityId.create(record.id),
    );
  }

  static toPersistence(profile: ProviderProfile): ProviderProfilePersistenceData {
    return {
      id: profile.id.toString(),
      provider: profile.provider,
      capabilities: profile.capabilities as unknown as Prisma.InputJsonValue,
      promptFormat: profile.promptFormat as unknown as Prisma.InputJsonValue,
      approvalRules: profile.approvalRules as unknown as Prisma.InputJsonValue,
      hookSupport: profile.hookSupport as unknown as Prisma.InputJsonValue,
      sandboxModel: profile.sandboxModel,
      outputSchema: profile.outputSchema as unknown as Prisma.InputJsonValue,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
