import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

/**
 * Single place that knows how to turn a connection string into a Prisma
 * driver adapter. Consumers that need lifecycle hooks (e.g. a NestJS
 * PrismaService extending PrismaClient) should use this instead of
 * duplicating the adapter wiring.
 */
export function createPrismaAdapter(databaseUrl: string): PrismaPg {
  return new PrismaPg({ connectionString: databaseUrl });
}

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
}
