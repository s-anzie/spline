import { Inject, Injectable, Logger } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { RUN_REPOSITORY, RunRepository } from "../domain/ports/run.repository.port";

/**
 * How long a run may show no sign of life before it is called dead.
 *
 * Generously longer than any heartbeat: a machine reports every few seconds,
 * so an hour of silence is not a slow task, it is a machine that is gone. The
 * cost of being wrong in each direction is not symmetric — killing a live run
 * loses work, leaving a dead one costs a ceiling slot forever — but an hour is
 * far enough out that being wrong is hard.
 */
export const DEFAULT_SILENCE_MS = 60 * 60 * 1000;

export interface AbandonSilentRunsInput {
  workspaceId: string;
  silenceMs?: number;
}

export interface AbandonedRun {
  runId: string;
  taskId: string;
  silentForMs: number;
}

/**
 * §9.13, §17.7 — a run whose machine stopped talking is finished, badly.
 *
 * Written because automatic dispatch made it load-bearing rather than tidy.
 * A run stays RUNNING until a machine reports; a machine that dies reports
 * nothing, so the run stays RUNNING forever. On its own that is a stale row.
 * Under a ceiling of three concurrent runs it is a third of the workspace's
 * capacity, permanently — and after three such deaths the whole chain stops
 * with no error anywhere, which is the worst way for a system to stop: the
 * screens all look fine.
 *
 * There were seven of these in the development database when this was
 * written, from machines that claimed an order and were killed.
 *
 * Judged at read against the clock, never by a stored deadline: what counts
 * as too long is a policy that can change, and a deadline written into a row
 * is a policy frozen at the moment the row was made (§9.13).
 */
@Injectable()
export class AbandonSilentRunsUseCase
  implements UseCase<AbandonSilentRunsInput, Result<AbandonedRun[], never>>
{
  private readonly logger = new Logger(AbandonSilentRunsUseCase.name);

  constructor(
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(input: AbandonSilentRunsInput): Promise<Result<AbandonedRun[], never>> {
    const now = this.clock.now();
    const silenceMs = input.silenceMs ?? DEFAULT_SILENCE_MS;
    const live = await this.runs.listLive(input.workspaceId);

    const abandoned: AbandonedRun[] = [];
    for (const run of live) {
      /**
       * `startedAt` when a machine took it, `createdAt` when none ever did.
       * Both are silences worth ending: an order nobody claimed in an hour is
       * an order for a machine that is not coming.
       */
      const since = (run.startedAt ?? run.createdAt).getTime();
      const silentForMs = now.getTime() - since;
      if (silentForMs < silenceMs) {
        continue;
      }

      const failed = run.fail(
        `no sign of life for ${Math.round(silentForMs / 60000)} minutes — the ` +
          "machine that took this never reported. Nothing was lost that the " +
          "machine had not already reported; dispatch it again when a machine " +
          "is reporting.",
        now,
      );
      if (failed.isFailure) {
        // A run that cannot move to FAILED from where it is has already been
        // decided by somebody else between the read and here. Leave it.
        continue;
      }

      await this.runs.save(run);
      await flushDomainEvents(run, this.publisher);
      abandoned.push({
        runId: run.id.value,
        taskId: run.taskId,
        silentForMs,
      });
    }

    if (abandoned.length > 0) {
      this.logger.warn(
        `${abandoned.length} run(s) in workspace ${input.workspaceId} were ` +
          "abandoned after going silent. Their ceiling slots are free again.",
      );
    }
    return Result.ok(abandoned);
  }
}
