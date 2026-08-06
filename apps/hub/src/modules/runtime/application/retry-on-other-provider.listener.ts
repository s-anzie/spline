import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OnEvent } from "@nestjs/event-emitter";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { RunFinished } from "../../execution/domain/run";
import {
  AUTOMATION_POLICY,
  AutomationPolicy,
  RUN_LEDGER,
  RunLedger,
} from "../domain/ports/dispatch.port";
import { PROVIDER_STORE, ProviderStore } from "../domain/ports/runtime.repository.port";
import { DispatchTaskUseCase } from "./dispatch-task.use-case";

/**
 * How many runs one task may cost before a person is asked.
 *
 * Three, and the number is a judgement rather than a discovery: it is enough
 * to survive one provider being out of quota and one machine dying, and few
 * enough that a task which cannot work stops costing money by the time
 * anybody wakes up.
 */
export const MAX_RUNS_PER_TASK = 3;

/**
 * §4.8, §9 — a failed run tries the next provider, once, and then stops.
 *
 * The case this exists for is dull and constant: one provider is out of
 * quota, or its CLI is broken on that machine, and the work simply cannot
 * proceed while nobody is awake. Trying the other one costs a run and often
 * finishes the task.
 *
 * What it must never become is a retry loop. Three things stop it:
 *
 *   - a DIFFERENT provider each time, never the one that just failed — a
 *     retry on the same provider is the same failure, paid for twice;
 *   - a hard ceiling of runs per task, so a task that cannot work stops
 *     rather than exhausting every provider forever;
 *   - and the workspace's own ceilings still apply underneath, because this
 *     goes through the same dispatch as everything else.
 *
 * It stays quiet when automation is off: somebody who dispatches by hand is
 * choosing the provider themselves, and re-choosing it for them would be
 * taking a decision they were in the middle of making.
 */
@Injectable()
export class RetryOnOtherProviderListener {
  private readonly logger = new Logger(RetryOnOtherProviderListener.name);
  private readonly hubUrl: string;

  constructor(
    @Inject(AUTOMATION_POLICY) private readonly policy: AutomationPolicy,
    @Inject(RUN_LEDGER) private readonly runs: RunLedger,
    @Inject(PROVIDER_STORE) private readonly providers: ProviderStore,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly dispatch: DispatchTaskUseCase,
    config: ConfigService,
  ) {
    this.hubUrl =
      config.get<string>("PUBLIC_HUB_URL") ??
      `http://localhost:${config.get<string>("PORT") ?? "8765"}`;
  }

  @OnEvent("execution.run_finished")
  async handle(event: RunFinished): Promise<void> {
    if (event.status !== "FAILED" || event.workspaceId === null) {
      return;
    }

    const limits = await this.policy.limitsFor(event.workspaceId);
    if (!limits.automatic) {
      return;
    }

    const already = await this.runs.countForTask(event.taskId);
    if (already >= MAX_RUNS_PER_TASK) {
      this.logger.warn(
        `Task ${event.taskId} has failed ${already} time(s); leaving it for a ` +
          "person rather than trying another provider.",
      );
      return;
    }

    const last = await this.runs.latestFor(event.workspaceId, event.taskId);
    const next = await this.otherProvider(last?.provider ?? null);
    if (!next) {
      this.logger.warn(
        `Task ${event.taskId} failed on "${last?.provider ?? "an unknown provider"}" ` +
          "and no other provider is available to try.",
      );
      return;
    }

    const dispatched = await this.dispatch.execute({
      workspaceId: event.workspaceId,
      taskId: event.taskId,
      provider: next,
      hubUrl: this.hubUrl,
    });
    if (dispatched.isFailure) {
      this.logger.log(
        `Could not retry ${event.taskId} on "${next}": ${dispatched.error.message}`,
      );
      return;
    }
    this.logger.log(
      `Task ${event.taskId} failed on "${last?.provider ?? "?"}" and was retried on "${next}".`,
    );
  }

  /**
   * Available, and not the one that just failed.
   *
   * `isAvailableAt` already accounts for a quota window, so a provider that
   * reported itself out is skipped without this needing to know why.
   */
  private async otherProvider(failed: string | null): Promise<string | null> {
    const now = this.clock.now();
    const catalogue = await this.providers.list();
    return (
      catalogue.find(
        (profile) => profile.provider !== failed && profile.isAvailableAt(now),
      )?.provider ?? null
    );
  }
}
