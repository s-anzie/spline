import { isStale } from "../../../kernel/domain/staleness";

/**
 * §9.16 — "L'intervalle périodique est délibérément plus long que la latence
 * de dispatch réactif : il n'y a rien d'urgent à traiter, seulement une
 * présence à confirmer."
 *
 * Four hours, not four seconds. A short interval would turn a checkpoint into
 * a poll, and a poll that fires constantly is noise nobody reads — which
 * ends in the same silence it was meant to break.
 */
export const DEFAULT_CHECKPOINT_MS = 4 * 60 * 60 * 1000;

export interface CheckInCandidate {
  actor: { type: string; id: string };
  /**
   * When this actor was last given something. Null means never, which is the
   * most silent state of all rather than the least.
   */
  lastAssignedAt: Date | null;
  /** Whether anything is actionable for them right now. */
  hasActionableWork: boolean;
}

export interface CheckInDue {
  actor: { type: string; id: string };
  /** Null when they have never been given anything. */
  silentForMs: number | null;
  /** §17.8 — the reason travels with the name, or the name is not actionable. */
  reason: string;
}

/**
 * §9.16 — who should be revisited even though there is nothing to hand them.
 *
 * The observation behind it (0.3.10) is worth restating because it is
 * counter-intuitive: **a system that is entirely up to date goes quiet, and
 * nothing reports that as a problem.** Every other signal in this codebase
 * fires when something is wrong; this one fires when nothing is, which is the
 * only way "no new work has been asked for in two days" ever reaches anyone.
 *
 * Judged at read like every other staleness here (§17.7): the interval is an
 * argument, so changing a workspace's policy changes every answer at once
 * rather than only future ones. Nothing is stored, and nothing needs a cron.
 *
 * The condition is the AND the spec writes: no actionable work **and** the
 * checkpoint elapsed. An actor with work in hand is not silent, however long
 * ago it was given to them.
 */
export function checkInsDue(
  candidates: readonly CheckInCandidate[],
  checkpointMs: number,
  now: Date,
): CheckInDue[] {
  return candidates
    .filter(
      (candidate) =>
        !candidate.hasActionableWork &&
        isStale(candidate.lastAssignedAt, checkpointMs, now),
    )
    .map((candidate) => ({
      actor: candidate.actor,
      silentForMs: candidate.lastAssignedAt
        ? now.getTime() - candidate.lastAssignedAt.getTime()
        : null,
      reason: candidate.lastAssignedAt
        ? `nothing assigned since ${candidate.lastAssignedAt.toISOString()}, and nothing actionable now`
        : "never assigned anything, and nothing actionable now",
    }))
    // Most silent first: never-assigned before long-silent before
    // recently-silent, so attention goes where the gap is widest.
    .sort((left, right) => (right.silentForMs ?? Infinity) - (left.silentForMs ?? Infinity));
}
