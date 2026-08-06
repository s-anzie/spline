/**
 * Git's index, one caller at a time. NOT the work.
 *
 * An earlier version of this held the whole repository for the duration of a
 * run, which quietly replaced the system that already exists for coordinating
 * agents: locks and claims (§5, §11) contend at the level of what is actually
 * shared — a file, a resource — and let two agents work in one project at
 * once, which is the entire point of having them. Serialising whole runs made
 * a workspace with three concurrent runs and one project effectively
 * single-threaded.
 *
 * What genuinely cannot overlap is git's own plumbing. `.git/index.lock` is
 * held by git for the length of an `add`/`commit`, and two landing together
 * fail with a message about a lock file — true, and useless to whoever reads
 * it. So the narrow thing is serialised and the wide thing is not.
 *
 * Per MACHINE, which is the whole scope this needs: two machines have two
 * copies and two indexes.
 */
const inFlight = new Map<string, Promise<unknown>>();

export async function withGitIndex<T>(path: string, work: () => Promise<T>): Promise<T> {
  const before = inFlight.get(path) ?? Promise.resolve();

  /**
   * Chained on the previous holder's SETTLING, not on its success: a task
   * that failed still has to release, and `.then(work)` alone would leave the
   * repository locked for the lifetime of the process after the first error.
   */
  const mine = before.then(work, work);

  // Swallowed on this copy only — the caller still receives the real outcome
  // through `mine`. Without it, one rejection becomes an unhandled rejection
  // the moment nobody else is waiting.
  inFlight.set(
    path,
    mine.catch(() => undefined),
  );

  try {
    return await mine;
  } finally {
    // Only if nobody queued behind: clearing unconditionally would drop a
    // waiter's place in the queue and let two run at once after all.
    if (inFlight.get(path) === undefined) {
      inFlight.delete(path);
    }
  }
}

/** Tests only: the map is process-wide and would otherwise leak between them. */
export function forgetRepositories(): void {
  inFlight.clear();
}
