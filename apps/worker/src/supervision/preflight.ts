/**
 * §18 — what has to be true about the machine before this daemon does
 * anything at all.
 *
 * Both checks are the kind that make every other control moot when they fail,
 * and both are on OpenClaw's own hardening list after the fact: a runtime
 * running as root has no boundary left to enforce, and a token file the whole
 * machine can read is a token the whole machine has.
 *
 * Returned as a list of complaints rather than thrown, so a misconfigured
 * machine learns everything wrong with it in one run instead of one item per
 * restart.
 */

export interface PreflightEnvironment {
  /** `process.getuid`, absent on platforms without one (Windows). */
  uid?: number;
  /** How a file's mode is read; injected so a test needs no real file. */
  statMode?: (path: string) => number;
  /** Files holding the hub token. Missing files are not a complaint. */
  secretFiles: readonly string[];
}

/**
 * A file readable by group or others. 0o077 is every permission bit that is
 * not the owner's — the same threshold OpenClaw settled on (mode 600) after
 * tokens were found readable on shared machines.
 */
const NOT_OWNER_ONLY = 0o077;

export function preflightComplaints(env: PreflightEnvironment): string[] {
  const complaints: string[] = [];

  if (env.uid === 0) {
    complaints.push(
      "this worker is running as root: a task that escapes its working " +
        "directory would own the machine, and every other control here " +
        "assumes it cannot. Run it as a dedicated unprivileged user.",
    );
  }

  const statMode = env.statMode;
  if (statMode) {
    for (const file of env.secretFiles) {
      let mode: number;
      try {
        mode = statMode(file);
      } catch {
        // A file that is not there holds no secret. Absence is configuration,
        // not a fault: the token may well come from the environment instead.
        continue;
      }
      if ((mode & NOT_OWNER_ONLY) !== 0) {
        complaints.push(
          `${file} is readable beyond its owner (mode ${(mode & 0o777).toString(8)}): ` +
            "it holds the hub token, which is enough to act as this machine. " +
            `Run: chmod 600 ${file}`,
        );
      }
    }
  }

  return complaints;
}
