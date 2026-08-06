import { WorkspaceSettings } from "./workspace";

/**
 * §9 — how much work this workspace may do without anybody clicking.
 *
 * Read out of the workspace's settings bag, which existed and which nothing
 * read. That is deliberate rather than convenient: a ceiling on automatic
 * work is a property of ONE workspace — the one somebody experiments in and
 * the one that matters should not share it — and the bag is already saved,
 * already audited on change, and already scoped to exactly that.
 */
export interface AutomationLimits {
  /**
   * Whether the hub may dispatch work nobody asked it to dispatch.
   *
   * Off until somebody says otherwise. Not because automation is wrong — it
   * is the whole point of this — but because turning it on for every existing
   * workspace at once would start spending on accounts whose owners never
   * heard of it. One switch, made once, per workspace.
   */
  automatic: boolean;
  /** How many runs may be in flight here at the same time. */
  concurrentRuns: number;
  /**
   * How many runs the hub may start here in a rolling day before it stops and
   * waits for a person.
   *
   * Per DAY rather than per stated need, and the difference is honesty: a
   * task carries no lineage back to the request that caused it — the manager
   * creates a goal of its own, and nothing links it to the need it came from.
   * A "per request" ceiling would therefore have had to invent that lineage
   * or quietly count something else. A day is what a night actually needs
   * protecting from, and it is countable from what exists.
   */
  runsPerDay: number;
}

export const AUTOMATION_DEFAULTS = {
  concurrentRuns: 3,
  runsPerDay: 20,
  /**
   * The ceilings on the ceilings. An operator may raise a limit; they may not
   * write a number that means "no limit" while looking like one — which is
   * what 1e9 in a JSON field is.
   */
  maxConcurrentRuns: 50,
  maxRunsPerDay: 500,
} as const;

/**
 * Every value has a safe reading of nonsense, and that is not defensiveness
 * for its own sake: this bag is free-form JSON that anybody holding
 * `manage_workspace` can write, and what it governs spends money. A ceiling
 * of `NaN` compares false against everything, so it would stop nothing at
 * all — the one failure mode that must not be reachable from a typo.
 */
export function automationOf(settings: WorkspaceSettings): AutomationLimits {
  const bag = settings.automation;
  if (typeof bag !== "object" || bag === null || Array.isArray(bag)) {
    return { automatic: false, ...defaults() };
  }
  const entry = bag as Record<string, unknown>;

  return {
    // Strictly `true`. "true", 1 and "yes" are somebody's typo, and a typo
    // must not be what starts an agent.
    automatic: entry.automatic === true,
    concurrentRuns: bounded(
      entry.concurrentRuns,
      AUTOMATION_DEFAULTS.concurrentRuns,
      AUTOMATION_DEFAULTS.maxConcurrentRuns,
    ),
    runsPerDay: bounded(
      entry.runsPerDay,
      AUTOMATION_DEFAULTS.runsPerDay,
      AUTOMATION_DEFAULTS.maxRunsPerDay,
    ),
  };
}

function defaults(): { concurrentRuns: number; runsPerDay: number } {
  return {
    concurrentRuns: AUTOMATION_DEFAULTS.concurrentRuns,
    runsPerDay: AUTOMATION_DEFAULTS.runsPerDay,
  };
}

function bounded(value: unknown, fallback: number, ceiling: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return fallback;
  }
  return Math.min(value, ceiling);
}
