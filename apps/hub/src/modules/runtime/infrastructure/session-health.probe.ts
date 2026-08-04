import { Inject, Injectable } from "@nestjs/common";

import { HealthSignal, Rollup } from "../../observability/domain/health";
import {
  HealthProbe,
  ProbeContext,
} from "../../observability/domain/ports/health-probe.port";
import { SESSION_STORE, SessionStore } from "../domain/ports/runtime.repository.port";

/** §17.7 names Session second among the monitored resources. */
export const DEFAULT_SESSION_STALENESS_MS = 5 * 60 * 1000;

/**
 * A live session that stopped reporting. §6.6 — "le Control Plane détecte
 * l'absence, marque les sessions perdues" — and detecting is what this does;
 * marking them is a decision an operator or the Worker takes, not a silent
 * side effect of reading a dashboard.
 */
@Injectable()
export class SessionHealthProbe implements HealthProbe {
  readonly name = "sessions";

  constructor(@Inject(SESSION_STORE) private readonly sessions: SessionStore) {}

  async assess(context: ProbeContext): Promise<HealthSignal> {
    const { thresholdMs, source } = context.thresholdMsFor(
      "staleness_sessions_ms",
      DEFAULT_SESSION_STALENESS_MS,
    );
    const sessions = await this.sessions.list({
      workspaceId: context.workspaceId,
      liveOnly: true,
    });
    const silent = sessions
      .filter((session) => session.isStaleAt(context.now, thresholdMs))
      .map((session) => ({
        id: session.id.value,
        type: `session:${session.provider}`,
        since: session.lastHeartbeatAt ?? session.startedAt,
      }));

    return HealthSignal.from({
      probe: this.name,
      rollup: Rollup.of(silent),
      thresholdMs,
      thresholdSource: source,
      degradedAt: 3,
      unhealthyAt: 10,
    });
  }
}
