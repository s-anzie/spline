import type { PrismaClient } from "@repo/db";

const TABLES = [
  "notifications",
  "events",
  "decisions",
  "artifacts",
  "resource_locks",
  "processes",
  "agent_credentials",
  "agents",
  "tasks",
  "goals",
  "workspace_memberships",
  "workspaces",
  "users",
] as const;

/** Truncates every domain table (CASCADE handles FK order) between e2e tests. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tableList = TABLES.map((table) => `"${table}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`);
}
