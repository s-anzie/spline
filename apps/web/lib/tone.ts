/**
 * What a state means, in the only four ways this console distinguishes.
 *
 * The domain has more than forty status words across tasks, runs, workers,
 * sessions, commands and events. An operator does not read forty words — they
 * read one question: *is this on me?* So every status collapses into a tone,
 * the tone drives colour AND height (see `StateMark`), and the word itself
 * still gets printed next to it for whoever needs the detail.
 */
export type Tone = "signal" | "waiting" | "live" | "settled" | "quiet";

/**
 * The words below are the hub's own, taken from the domain enums — task,
 * goal, run, worker, session, command, delivery, lock, severity, health. A
 * word this console invents is a word that will never arrive, and a word it
 * misses falls through to `quiet`, which is the safe direction: an unknown
 * state reads as inert rather than as fine.
 */

/** Needs a person, or failed. */
const SIGNAL = new Set([
  "BLOCKED",
  "FAILED",
  "CRASHED",
  "ABANDONED",
  "ERROR",
  "CRITICAL",
  "DEGRADED",
  "UNHEALTHY",
]);

/** Waiting on something, including on somebody. */
const WAITING = new Set([
  "PENDING",
  "READY",
  "ASSIGNED",
  "VALIDATING",
  "REVIEW",
  "CLAIMED",
  "STARTING",
  "IDLE",
  "WAITING",
  "DRAINING",
  "WARNING",
  "DELIVERED",
  "SEEN",
]);

/** Moving on its own. Nothing to do but watch. */
const LIVE = new Set(["RUNNING", "ACTIVE", "ONLINE", "HELD"]);

/** Finished well. */
const SETTLED = new Set([
  "COMPLETED",
  "ACKNOWLEDGED",
  "ACTED_ON",
  "HEALTHY",
  "RELEASED",
]);

export function toneOf(status: string | null | undefined): Tone {
  if (!status) return "quiet";
  const word = status.toUpperCase();
  if (SIGNAL.has(word)) return "signal";
  if (WAITING.has(word)) return "waiting";
  if (LIVE.has(word)) return "live";
  if (SETTLED.has(word)) return "settled";
  return "quiet";
}

/** The CSS variable each tone paints with. */
export const TONE_COLOUR: Record<Tone, string> = {
  signal: "var(--signal)",
  waiting: "var(--waiting)",
  live: "var(--live)",
  settled: "var(--settled)",
  quiet: "var(--text-faint)",
};

/**
 * How much of the mark's height the tone fills.
 *
 * A dot that differs only by hue is invisible to a reader who cannot separate
 * red from green, and unreadable to anyone in a hurry. Height carries the
 * same information the colour does, so the queue can be skimmed by shape.
 */
export const TONE_HEIGHT: Record<Tone, string> = {
  signal: "100%",
  waiting: "70%",
  live: "70%",
  settled: "35%",
  quiet: "20%",
};
