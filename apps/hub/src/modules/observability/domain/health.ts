import { ageMs } from "../../../kernel/domain/staleness";

/** §17.6 */
export const HEALTH_LEVELS = [
  "HEALTHY",
  "WARNING",
  "DEGRADED",
  "UNHEALTHY",
] as const;
export type HealthLevel = (typeof HEALTH_LEVELS)[number];

/** A system is not "healthy on average": the worst signal decides. */
export function worstOf(levels: readonly HealthLevel[]): HealthLevel {
  return levels.reduce<HealthLevel>(
    (worst, level) =>
      HEALTH_LEVELS.indexOf(level) > HEALTH_LEVELS.indexOf(worst) ? level : worst,
    "HEALTHY",
  );
}

export interface DegradedResource {
  id: string;
  type: string;
  /** Since when — §17.8 asks for it by name. */
  since: Date;
}

/**
 * §17.8, made impossible to get wrong.
 *
 * That section is the only one in the chapter quoting a production
 * observation: "21 commandes runtime bloquées" with no way to know which ones
 * is an alert an operator cannot act on. Read as a writing guideline, it gets
 * forgotten. So there is no constructor taking a number: a Rollup is built
 * from its items and its count is derived. A count cannot be published alone,
 * and cannot drift from the detail it summarises.
 */
export class Rollup {
  private constructor(readonly items: readonly DegradedResource[]) {}

  static of(items: readonly DegradedResource[]): Rollup {
    return new Rollup(
      // Longest-degraded first: that is what an operator opens the list for.
      [...items].sort((a, b) => a.since.getTime() - b.since.getTime()),
    );
  }

  get count(): number {
    return this.items.length;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  ageMsAt(now: Date): number[] {
    return this.items.map((item) => ageMs(item.since, now));
  }
}

export interface SignalInput {
  probe: string;
  rollup: Rollup;
  /** The staleness window applied (§17.7). */
  thresholdMs: number;
  /** And where it came from — a workspace policy, or the documented default. */
  thresholdSource: "policy" | "default";
  /** How many degraded resources make this DEGRADED, and how many UNHEALTHY. */
  degradedAt: number;
  unhealthyAt: number;
}

export interface CriticalInput {
  probe: string;
  rollup: Rollup;
  reason: string;
}

/**
 * One probe's answer: a level, the resources behind it, and the threshold
 * that produced it. Reporting a state without what decided it is the same
 * omission §17.8 is about, one level up.
 */
export class HealthSignal {
  private constructor(
    readonly probe: string,
    readonly level: HealthLevel,
    readonly rollup: Rollup,
    readonly thresholdMs: number | null,
    readonly thresholdSource: "policy" | "default" | null,
    readonly reason: string | null,
  ) {}

  static from(input: SignalInput): HealthSignal {
    const count = input.rollup.count;
    const level: HealthLevel =
      count === 0
        ? "HEALTHY"
        : count >= input.unhealthyAt
          ? "UNHEALTHY"
          : count >= input.degradedAt
            ? "DEGRADED"
            : "WARNING";
    return new HealthSignal(
      input.probe,
      level,
      input.rollup,
      input.thresholdMs,
      input.thresholdSource,
      null,
    );
  }

  /**
   * For a condition with no scale. The audit chain is intact or it is not;
   * counting broken entries would suggest that fewer is acceptable.
   */
  static critical(input: CriticalInput): HealthSignal {
    return new HealthSignal(
      input.probe,
      "UNHEALTHY",
      input.rollup,
      null,
      null,
      input.reason,
    );
  }
}

/** The overview AND the detail, never one without the other (§17.8). */
export class WorkspaceHealth {
  private constructor(
    readonly workspaceId: string,
    readonly level: HealthLevel,
    readonly signals: readonly HealthSignal[],
  ) {}

  static of(workspaceId: string, signals: readonly HealthSignal[]): WorkspaceHealth {
    return new WorkspaceHealth(
      workspaceId,
      worstOf(signals.map((signal) => signal.level)),
      signals,
    );
  }

  get totalDegraded(): number {
    return this.signals.reduce((total, signal) => total + signal.rollup.count, 0);
  }
}
