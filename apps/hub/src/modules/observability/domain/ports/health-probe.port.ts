import { HealthSignal } from "../health";

export interface ProbeContext {
  workspaceId: string;
  now: Date;
  /**
   * The staleness window this probe should apply, and where it came from
   * (§17.7: "documentés et ajustables, jamais des constantes implicites").
   * Resolved once by the assessor so every probe reads the same source.
   */
  thresholdMsFor: (rule: string, fallbackMs: number) => {
    thresholdMs: number;
    source: "policy" | "default";
  };
}

/**
 * A probe lives in the module whose health it reports, and implements this
 * port. Two reasons, and the second matters more:
 *
 * 1. This module has no business knowing four other modules' internal states.
 * 2. A future module becomes observable by supplying a probe — without
 *    touching anything here. Observability has to extend by addition, the way
 *    the extension registry does (§19); a switch statement listing modules
 *    would need editing every time the system grows.
 */
export interface HealthProbe {
  readonly name: string;
  assess(context: ProbeContext): Promise<HealthSignal>;
}
export const HEALTH_PROBES = "observability/HealthProbes";

/**
 * Documented defaults (§17.7). They live here, together, precisely so they
 * are not "des constantes implicites dispersées dans le code" — a workspace
 * policy overrides any of them.
 */
export const DEFAULT_STALENESS_MS = {
  /** A lock still held past its lease: its holder vanished (§13.5-13.6). */
  staleness_locks_ms: 15 * 60 * 1000,
  /** A blocked task stops progressing (§4.22); a day is a working pause. */
  staleness_blocked_tasks_ms: 24 * 60 * 60 * 1000,
  /** Work finished with nobody validating it (§11). */
  staleness_pending_validations_ms: 4 * 60 * 60 * 1000,
} as const;
