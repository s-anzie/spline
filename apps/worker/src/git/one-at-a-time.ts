/**
 * §8.4 — two tasks never work in one repository at the same time.
 *
 * The consequence of working in the operator's own copy rather than in a
 * throwaway worktree: one directory holds one checked-out branch. Two agents
 * starting at once would each `git checkout -B` over the other's work, and
 * the second would report a diff containing the first's edits as its own.
 *
 * Per MACHINE, which is the whole scope this needs. Two machines each have
 * their own copy and run in parallel; nothing here coordinates between them
 * and nothing needs to. Inside one machine, the second task waits.
 *
 * Waiting rather than refusing, deliberately. A refusal would make a
 * workspace with three concurrent runs and one repository fail two of them
 * every time — the ceiling would be nominal and the failures constant. The
 * queue is bounded by the ceiling above it, so it cannot grow without limit.
 */
const inFlight = new Map<string, Promise<unknown>>();

export async function withRepository<T>(path: string, work: () => Promise<T>): Promise<T> {
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
