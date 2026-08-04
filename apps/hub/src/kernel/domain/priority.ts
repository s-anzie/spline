/**
 * System-wide priority vocabulary (v3 §9.7), shared by Goals and Tasks —
 * scheduling vocabulary, not business knowledge.
 */
export const PRIORITIES = ["CRITICAL", "HIGH", "NORMAL", "LOW", "BACKGROUND"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const DEFAULT_PRIORITY: Priority = "NORMAL";

/** Sort comparator: most-urgent first. */
export function comparePriority(a: Priority, b: Priority): number {
  return PRIORITIES.indexOf(a) - PRIORITIES.indexOf(b);
}
