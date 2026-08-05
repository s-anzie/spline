import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Owner-only, like every other directory this daemon creates. A workspace
 * directory holds whatever an agent produces, and on a shared machine that is
 * not for everyone to read.
 */
const DIRECTORY_MODE = 0o700;

/**
 * §7.9, §6.10 — makes sure a workspace has the directory its tasks work in.
 *
 * Found by the first real run rather than by a test, and the reason is worth
 * recording: every test pre-created the directory, so every test agreed that
 * a path which never existed was fine. `planSpawn` then refused it — correctly
 * — because containment is judged on the REAL path, and a path that cannot be
 * resolved cannot be shown to be inside anything.
 *
 * Created by the worker rather than by the hub: the hub has no filesystem to
 * create it on, and a machine that received a path it could not make would
 * have to refuse work for a reason nobody could act on remotely.
 */
export function ensureWorkspaceDirectory(root: string, workspaceId: string): string {
  const directory = join(root, workspaceId);
  mkdirSync(directory, { recursive: true, mode: DIRECTORY_MODE });
  return directory;
}
