import { PrismaClient } from "@repo/db";

/**
 * Truncates every mutable table between e2e tests. Order-insensitive thanks
 * to CASCADE. Extend this list with each module's migration.
 */
const TABLES = [
  "users",
  "organizations",
  "workspaces",
  "workspace_memberships",
  "actor_credentials",
];

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(", ")} CASCADE`,
  );
}
