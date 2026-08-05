import { Global, Injectable, Module } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import {
  LatestRun,
  RecordOutcomeInput,
  RUN_LEDGER,
  RunLedger,
} from "../../runtime/domain/ports/dispatch.port";
import { StartRunUseCase } from "../application/run.use-cases";
import { ExecutionModule } from "../execution.module";
import { Inject } from "@nestjs/common";
import {
  RUN_REPOSITORY,
  RunRepository,
} from "../domain/ports/run.repository.port";

/**
 * §9.12, §4.8 — supplies what runtime declares. Only this module knows how
 * runs are numbered and what a resumable attempt looks like.
 */
@Injectable()
export class RunLedgerAdapter implements RunLedger {
  constructor(
    private readonly startRun: StartRunUseCase,
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async openRun(workspaceId: string, taskId: string): Promise<{ runId: string }> {
    const started = await this.startRun.execute({ workspaceId, taskId });
    if (started.isFailure) {
      // A run that cannot be opened is a dispatch that must not proceed, and
      // the transaction takes the whole request with it.
      throw new Error(`could not open a run for "${taskId}": ${started.error.message}`);
    }
    return started.value;
  }

  /**
   * §4.8 — the attempt learns what it cost and which session it left behind.
   *
   * Everything here is defensive because the caller has already committed to
   * the order being finished: a run that vanished, an attempt already closed,
   * a payload without a run — none of them may turn a completed order into a
   * failed one. What they do is leave a run an operator can still find, which
   * is why the order carries the run id.
   */
  async recordOutcome(input: RecordOutcomeInput): Promise<void> {
    if (!input.runId) {
      return;
    }
    const run = await this.runs.findById(input.runId);
    if (!run || run.workspaceId !== input.workspaceId) {
      return;
    }

    const now = this.clock.now();
    const closed = run.finishAttempt(
      {
        outcome: input.outcome === "COMPLETED" ? "COMPLETED" : "FAILED",
        providerSessionId: asString(input.result.providerSessionId),
        tokenUsage: asNumbers(input.result.tokenUsage),
        cost: typeof input.result.cost === "number" ? input.result.cost : undefined,
      },
      now,
    );
    if (closed.isFailure) {
      // No attempt in flight: the run was closed by something else, and that
      // something else is the record.
      return;
    }

    /**
     * §11 — VALIDATING, never COMPLETED. A run whose agent finished has
     * produced results, not proof: an agent never declares its own success,
     * and a run that went straight to COMPLETED here would be doing exactly
     * that on its behalf.
     */
    if (input.outcome === "COMPLETED") {
      run.toValidating(now);
    } else {
      run.fail(input.failureReason ?? "the worker reported a failure", now);
    }

    await this.runs.save(run);
    await flushDomainEvents(run, this.publisher);
  }

  async latestFor(workspaceId: string, taskId: string): Promise<LatestRun | null> {
    // Newest first, so the first row is the last run.
    const [run] = await this.runs.list({ workspaceId, taskId, limit: 1 });
    if (!run) {
      return null;
    }
    const last = run.attempts.at(-1);
    return {
      runId: run.id.value,
      provider: last?.provider ?? null,
      providerSessionId: last?.providerSessionId ?? null,
    };
  }
}

@Global()
@Module({
  imports: [ExecutionModule],
  providers: [{ provide: RUN_LEDGER, useClass: RunLedgerAdapter }],
  exports: [RUN_LEDGER],
})
export class RunLedgerModule {}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function asNumbers(value: unknown): Record<string, number> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const numbers = Object.entries(value as Record<string, unknown>).filter(
    ([, item]) => typeof item === "number",
  ) as [string, number][];
  return numbers.length > 0 ? Object.fromEntries(numbers) : undefined;
}
