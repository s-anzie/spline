import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OnEvent } from "@nestjs/event-emitter";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { TaskAssigned, TaskCreated } from "../../task/domain/task-events";
import {
  AUTOMATION_POLICY,
  AutomationPolicy,
  RUN_LEDGER,
  RunLedger,
} from "../domain/ports/dispatch.port";
import { PROVIDER_STORE, ProviderStore } from "../domain/ports/runtime.repository.port";
import { DispatchTaskUseCase } from "./dispatch-task.use-case";

const A_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * §9 — the hub hands out the work nobody clicked on.
 *
 * This is the piece that turns "a manager cut five tasks" into "five agents
 * are working": without it every task the manager creates waits for a person
 * to press Dispatch, which is precisely the person the manager exists to
 * spare.
 *
 * Everything here is about what it REFUSES to do, because a dispatcher that
 * only knows how to say yes is a way to spend a night by accident:
 *
 *   - off unless the workspace turned it on, per workspace;
 *   - never more than `concurrentRuns` in flight at once;
 *   - never more than `runsPerDay` started in a rolling day;
 *   - and it never retries. A task it declines is a task somebody can still
 *     dispatch by hand, and the next assignment will bring it back past these
 *     same checks. Retrying in a loop is how a ceiling becomes a busy-wait.
 *
 * It reacts to both facts for the reason the notification listener records:
 * `Task.create` raises only `task.created`, so listening to `task.assigned`
 * alone would dispatch every later reassignment and never the first one.
 */
@Injectable()
export class AutoDispatchListener {
  private readonly logger = new Logger(AutoDispatchListener.name);

  constructor(
    @Inject(AUTOMATION_POLICY) private readonly policy: AutomationPolicy,
    @Inject(RUN_LEDGER) private readonly runs: RunLedger,
    @Inject(PROVIDER_STORE) private readonly providers: ProviderStore,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly dispatch: DispatchTaskUseCase,
    config: ConfigService,
  ) {
    // The same address the controller resolves, read the same way and once:
    // an agent told a different hub each time is an agent nobody can debug.
    this.hubUrl =
      config.get<string>("PUBLIC_HUB_URL") ??
      `http://localhost:${config.get<string>("PORT") ?? "8765"}`;
  }

  private readonly hubUrl: string;

  @OnEvent("task.created")
  @OnEvent("task.assigned")
  async handle(event: TaskAssigned | TaskCreated): Promise<void> {
    const workspaceId = event.workspaceId;
    if (workspaceId === null) {
      return;
    }

    const limits = await this.policy.limitsFor(workspaceId);
    if (!limits.automatic) {
      return;
    }

    /**
     * The dead are buried before the living are counted.
     *
     * A run whose machine died stays RUNNING forever and holds a ceiling
     * slot. Under a ceiling of three, three such deaths stop the workspace
     * with no error anywhere — every screen looks fine and nothing moves.
     * Sweeping here rather than on a timer means the slot is free at the
     * exact moment somebody asks whether there is room.
     */
    const buried = await this.runs.abandonSilent(workspaceId);
    if (buried > 0) {
      this.logger.warn(
        `${buried} silent run(s) ended in workspace ${workspaceId}; their slots are free.`,
      );
    }

    const live = await this.runs.countLive(workspaceId);
    if (live >= limits.concurrentRuns) {
      // Not an error and not a failure: the work is assigned and waiting, and
      // the next task to finish is what makes room. Saying so once is worth
      // more than a silent no.
      this.logger.log(
        `Holding "${event.aggregateId}": ${live} run(s) already in flight, ` +
          `ceiling ${limits.concurrentRuns}.`,
      );
      return;
    }

    const today = await this.runs.countSince(
      workspaceId,
      new Date(this.clock.now().getTime() - A_DAY_MS),
    );
    if (today >= limits.runsPerDay) {
      this.logger.warn(
        `Automatic dispatch stopped in workspace ${workspaceId}: ${today} run(s) ` +
          `in the last day, ceiling ${limits.runsPerDay}. Work is assigned and ` +
          "waiting for a person.",
      );
      return;
    }

    const provider = await this.pickProvider();
    if (!provider) {
      this.logger.warn(
        `Nothing to dispatch "${event.aggregateId}" with: no provider is available.`,
      );
      return;
    }

    const dispatched = await this.dispatch.execute({
      workspaceId,
      taskId: event.aggregateId,
      provider,
      hubUrl: this.hubUrl,
    });
    if (dispatched.isFailure) {
      /**
       * Refusals here are ordinary and expected: a task that is not
       * dispatchable yet, no machine attached, a workspace with nothing to
       * run on. They are logged, never raised — throwing would fail the
       * request that created the task, which is somebody else's act.
       */
      this.logger.log(
        `Not dispatched automatically: ${dispatched.error.message} ` +
          `(task ${event.aggregateId})`,
      );
    }
  }

  /**
   * §4.14 — the first provider that says it can take work.
   *
   * Availability is asked of the profile rather than assumed, so one that has
   * hit its quota is skipped instead of being dispatched to and failing. The
   * order is the catalogue's own; choosing between two healthy providers is a
   * policy question (§12) and inventing an answer here would freeze it.
   */
  private async pickProvider(): Promise<string | null> {
    const now = this.clock.now();
    const catalogue = await this.providers.list();
    return catalogue.find((profile) => profile.isAvailableAt(now))?.provider ?? null;
  }
}
