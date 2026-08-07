import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import {
  SESSION_STORE,
  SessionStore,
  WORKER_STORE,
  WorkerStore,
} from "../domain/ports/runtime.repository.port";

/**
 * §6.6 — how long a machine may say nothing before what it holds is lost.
 *
 * A MACHINE's silence, not a session's: the machine is the thing that
 * reports, and the session is what it was holding.
 */
export const DEFAULT_MACHINE_SILENCE_MS = 5 * 60 * 1000;

export interface RecoverInput {
  workspaceId: string;
  /** Overridable so a workspace policy can tighten it (§17.7). */
  stalenessMs?: number;
}

export interface RecoveryReport {
  /** §17.8 — which sessions, not how many. */
  recovered: { sessionId: string; taskId: string | null; silentSince: string }[];
  /** Sessions whose machine is gone entirely, worth telling apart. */
  workersGone: string[];
}

/**
 * §6.6 — "le Control Plane détecte l'absence, expire les leases, marque les
 * sessions perdues, replace les tâches dans la file. **Aucune tâche ne doit
 * disparaître.**"
 *
 * Detection already existed as a health probe. What was missing is the part
 * that costs work: a session that stopped reporting stayed `RUNNING` forever,
 * and the task it held was counted as in flight by the scheduler — so it
 * appeared in neither the ready queue nor the waiting list. A task nobody can
 * see is a task that has disappeared, whatever the row says.
 *
 * This marks the session CRASHED and publishes the fact. Putting the task
 * back is NOT done here: the task machine is the task's authority (§22.6),
 * and a second module writing task statuses would be two owners of one field.
 * The task module listens and releases its own task.
 *
 * Explicit rather than periodic, and that is the honest half: §9.16's
 * periodic trigger does not exist yet, so this runs when someone asks — an
 * operator, or the worker itself on reconnecting. Named in the module doc.
 */
@Injectable()
export class RecoverCrashedSessionsUseCase
  implements UseCase<RecoverInput, Result<RecoveryReport, GuardViolation>>
{
  constructor(
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(WORKER_STORE) private readonly workers: WorkerStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(input: RecoverInput): Promise<Result<RecoveryReport, GuardViolation>> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }

    const now = this.clock.now();
    /**
     * Judged against the MACHINE, which is the only thing that reports.
     *
     * This used to ask whether the SESSION was stale, and nothing ever sent a
     * session heartbeat: `lastHeartbeatAt` was written once, at creation. So
     * every session older than five minutes qualified, and pressing "Recover
     * lost sessions" would have crashed every healthy agent in the workspace
     * — a button that destroys exactly what it claims to rescue. It was
     * harmless only for as long as no session existed at all.
     */
    const ttl = input.stalenessMs ?? DEFAULT_MACHINE_SILENCE_MS;
    const live = await this.sessions.list({
      workspaceId: workspaceId.value,
      liveOnly: true,
    });

    const recovered: RecoveryReport["recovered"] = [];
    const workersGone = new Set<string>();

    for (const session of live) {
      const worker = await this.workers.findById(session.workerId);
      const machineGone = !worker || worker.isStaleAt(now, ttl);
      if (!machineGone) {
        // Its machine is answering, so this session is not lost — whatever
        // any timer of its own might once have said.
        continue;
      }
      workersGone.add(session.workerId);

      // The reason is kept because §17.8 asks for it and because "crashed"
      // alone tells an operator nothing about where to look.
      const marked = session.changeStatus(
        "CRASHED",
        now,
        worker
          ? `its machine stopped reporting (${worker.hostname})`
          : `its machine no longer exists (${session.workerId})`,
      );
      if (marked.isFailure) {
        continue;
      }
      await this.sessions.save(session);
      await flushDomainEvents(session, this.publisher);
      recovered.push({
        sessionId: session.id.value,
        taskId: session.taskId,
        silentSince: session.startedAt.toISOString(),
      });
    }

    return Result.ok({ recovered, workersGone: [...workersGone] });
  }
}
