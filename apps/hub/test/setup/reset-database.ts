import { PrismaClient } from "@repo/db";

/**
 * Truncates every mutable table between e2e tests.
 *
 * The list is read from the database rather than hand-maintained, for two
 * reasons that both cost real time to learn:
 *
 * 1. A hand-written list goes stale. Every module had to remember to extend
 *    it, and forgetting shows up as a test polluted by the previous one —
 *    which reads as a flaky test, not as a missing line.
 * 2. `CASCADE` reaches tables that are not in the list, so the lock order of
 *    the statement depended on which tables happened to be named. Two resets
 *    overlapping (a previous suite's pool still draining) then deadlocked:
 *    Postgres 40P01, surfacing as an unrelated test failing roughly once
 *    every few full runs. Naming every table, always sorted, makes the lock
 *    order deterministic.
 */
let cached: string[] | null = null;

async function tableNames(prisma: PrismaClient): Promise<string[]> {
  if (cached) {
    return cached;
  }
  const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
     ORDER BY tablename`,
  );
  cached = rows.map((row) => row.tablename);
  return cached;
}

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await tableNames(prisma);
  if (tables.length === 0) {
    return;
  }
  const statement = `TRUNCATE TABLE ${tables
    .map((table) => `"${table}"`)
    .join(", ")} RESTART IDENTITY CASCADE`;

  // A deadlock is the one error worth retrying here: Postgres names a victim
  // and the same statement succeeds once the other session is done — the
  // documented response is to retry. Retrying anything else would hide it.
  //
  // The Postgres code lives in `meta`, not on the error: Prisma surfaces
  // `P2010` for a raw query and keeps `40P01` underneath. Matching on the
  // outer code silently never fired.
  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.$executeRawUnsafe(statement);
      return;
    } catch (error) {
      if (!isDeadlock(error) || attempt >= 4) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}

function isDeadlock(error: unknown): boolean {
  const { code, meta, message } = error as {
    code?: string;
    meta?: { code?: string };
    message?: string;
  };
  return code === "40P01" || meta?.code === "40P01" || (message ?? "").includes("40P01");
}
