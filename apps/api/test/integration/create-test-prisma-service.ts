import { ConfigService } from "@nestjs/config";

import { PrismaService } from "../../src/prisma/prisma.service";

/**
 * Builds a real PrismaService (same code path as production) wired to
 * whatever DATABASE_URL the e2e globalSetup pointed at spline_test.
 */
export function createTestPrismaService(): PrismaService {
  const configService = {
    getOrThrow: (key: string): string => {
      const value = process.env[key];
      if (!value) {
        throw new Error(`Missing env var "${key}" in test`);
      }
      return value;
    },
  } as unknown as ConfigService;

  return new PrismaService(configService);
}
