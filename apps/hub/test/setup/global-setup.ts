import { execFileSync } from "node:child_process";
import * as path from "node:path";

import * as dotenv from "dotenv";

/**
 * Runs once before the whole e2e suite: loads apps/hub/.env, points the app
 * at the dedicated spline_v3_test database (never spline_v3_dev), and makes
 * sure its schema is up to date before any test touches it.
 */
export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });

  const testDatabaseUrl = process.env.DATABASE_URL_TEST;
  if (!testDatabaseUrl) {
    throw new Error(
      "DATABASE_URL_TEST must be set (see apps/hub/.env) to run e2e tests",
    );
  }

  process.env.DATABASE_URL = testDatabaseUrl;

  const databasePackageDir = path.resolve(__dirname, "../../../../packages/database");

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: databasePackageDir,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: "inherit",
  });
}
