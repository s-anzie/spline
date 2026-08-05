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
import { DEFAULT_SESSION_STALENESS_MS } from "../infrastructure/session-health.probe";
import {
  SESSION_STORE,
  SessionStore,
  WORKER_STORE,
  WorkerStore,
} from "../domain/ports/runtime.repository.port";

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
    const ttl = input.stalenessMs ?? DEFAULT_SESSION_STALENESS_MS;
    const live = await this.sessions.list({
      workspaceId: workspaceId.value,
      liveOnly: true,
    });

    const recovered: RecoveryReport["recovered"] = [];
    const workersGone = new Set<string>();

    for (const session of live) {
      if (!session.isStaleAt(now, ttl)) {
        continue;
      }
      const worker = await this.workers.findById(session.workerId);
      const machineGone = !worker || worker.isStaleAt(now, ttl);
      if (machineGone) {
        workersGone.add(session.workerId);
      }

      // The reason is kept because §17.8 asks for it and because "crashed"
      // alone tells an operator nothing about where to look.
      const marked = session.changeStatus(
        "CRASHED",
        now,
        machineGone
          ? `the machine stopped reporting as well (${session.workerId})`
          : "the session stopped reporting while its machine kept answering",
      );
      if (marked.isFailure) {
        continue;
      }
      await this.sessions.save(session);
      await flushDomainEvents(session, this.publisher);
      recovered.push({
        sessionId: session.id.value,
        taskId: session.taskId,
        silentSince: (session.lastHeartbeatAt ?? session.startedAt).toISOString(),
      });
    }

    return Result.ok({ recovered, workersGone: [...workersGone] });
  }
}
