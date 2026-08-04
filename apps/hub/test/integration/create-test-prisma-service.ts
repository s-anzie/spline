import { createPrismaClient, PrismaClient } from "@repo/db";

/**
 * Direct Prisma client against the test database (DATABASE_URL is pointed
 * at spline_v3_test by the e2e global setup before anything runs).
 */
export function createTestPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url || !url.includes("test")) {
    throw new Error(
      "Integration tests must run through the e2e config (DATABASE_URL_TEST)",
    );
  }
  return createPrismaClient(url);
}
