import { Inject, Injectable } from "@nestjs/common";

import { HealthSignal, Rollup } from "../../observability/domain/health";
import {
  HealthProbe,
  ProbeContext,
} from "../../observability/domain/ports/health-probe.port";
import { RUN_LEDGER, RunLedger } from "../domain/ports/dispatch.port";
import { SESSION_STORE, SessionStore } from "../domain/ports/runtime.repository.port";

/**
 * §6.6, §17.7 — an agent's instance that outlived the work it was opened for.
 *
 * This probe used to measure a session's own heartbeat, and that was a false
 * alarm generator: nothing ever SENT a session heartbeat. `lastHeartbeatAt`
 * was written once, at creation, and never again — so every session older
 * than the threshold was reported silent, including one that had been working
 * happily for an hour. The workspace's health screen carried a standing
 * warning that meant nothing, which is worse than no warning, because it
 * teaches a reader to skip the row.
 *
 * A machine reports against a RUN. That is the signal of life, it is what the
 * silence sweep already judges (§9.13), and a session now ends with its run.
 * Two timers for one question, and the second one had no input.
 *
 * So this watches the INVARIANT that makes the first one sufficient: a live
 * session whose run has ended is a session the ending never reached. That is
 * a real defect — a ceiling counts against it and the screen says an agent is
 * working — and it is exactly what nothing would have noticed.
 */
@Injectable()
export class SessionHealthProbe implements HealthProbe {
  readonly name = "sessions";

  constructor(
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(RUN_LEDGER) private readonly runs: RunLedger,
  ) {}

  async assess(context: ProbeContext): Promise<HealthSignal> {
    const live = await this.sessions.list({
      workspaceId: context.workspaceId,
      liveOnly: true,
    });

    /**
     * Only sessions that were opened FOR a task can be judged this way, and
     * every session opened by a dispatch is. One asked about the tasks in
     * hand rather than "all live runs", so the query is bounded by what this
     * probe already holds.
     */
    const withTask = live.filter(
      (session): session is typeof session & { taskId: string } =>
        session.taskId !== null,
    );
    const stillRunning = new Set(
      await this.runs.liveTaskIds(
        context.workspaceId,
        withTask.map((session) => session.taskId),
      ),
    );

    const orphaned = withTask
      .filter((session) => !stillRunning.has(session.taskId))
      .map((session) => ({
        id: session.id.value,
        type: `session:${session.provider}`,
        since: session.startedAt,
      }));

    return HealthSignal.from({
      probe: this.name,
      rollup: Rollup.of(orphaned),
      /**
       * Zero, and said so: nothing here is judged against a clock any more. A
       * session outliving its run is wrong the instant it happens, not after
       * five minutes of it. The field stays because every signal carries one.
       */
      thresholdMs: 0,
      thresholdSource: "default",
      degradedAt: 1,
      unhealthyAt: 5,
    });
  }
}
