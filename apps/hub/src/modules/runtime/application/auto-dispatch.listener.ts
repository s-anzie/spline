import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OnEvent } from "@nestjs/event-emitter";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { TaskAssigned, TaskCreated } from "../../task/domain/task-events";
import {
  AUTOMATION_POLICY,
  AutomationPolicy,
  DISPATCHABLE_TASK,
  DispatchableTask,
  RUN_LEDGER,
  RunLedger,
} from "../domain/ports/dispatch.port";
import {
  PROVIDER_STORE,
  ProviderStore,
  WORKER_STORE,
  WorkerStore,
} from "../domain/ports/runtime.repository.port";
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
    @Inject(DISPATCHABLE_TASK) private readonly tasks: DispatchableTask,
    @Inject(WORKER_STORE) private readonly workers: WorkerStore,
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
    if (event.workspaceId === null) {
      return;
    }
    await this.sweep(event.workspaceId);
  }

  /**
   * §9 — a run ending is the moment room appears.
   *
   * The ceiling exists to stop a workspace spending a night at once, and the
   * comment on it always said "the next task to finish is what makes room" —
   * but nothing acted on that. Work held back by a full ceiling waited for
   * somebody to create ANOTHER task before it was looked at again.
   */
  @OnEvent("execution.run_finished")
  async onRunFinished(event: { workspaceId: string | null }): Promise<void> {
    if (event.workspaceId === null) {
      return;
    }
    await this.sweep(event.workspaceId);
  }

  /**
   * §7.4 — a machine arriving is the moment work can start at all.
   *
   * This is the trigger that closes the stall this listener was rewritten
   * for. A machine announces what it can drive when it registers, and that
   * registration is what puts a provider in the catalogue — so it is also
   * the exact instant when a task refused for "no provider available"
   * becomes runnable. A daemon that boots hours after somebody asked for the
   * work now picks it up on arrival instead of waiting for a new task.
   *
   * The workspaces come from THIS machine's own attachments, never from a
   * table of all workspaces: §4.2's isolation is absolute, and a sweep that
   * enumerated every workspace would be exactly the cross-workspace query it
   * forbids. A machine looking at the workspaces it serves is looking at its
   * own scope.
   */
  @OnEvent("runtime.worker_registered")
  @OnEvent("runtime.worker_attached")
  async onMachine(event: { aggregateId: string }): Promise<void> {
    const worker = await this.workers.findById(event.aggregateId);
    if (!worker) {
      return;
    }
    for (const workspaceId of worker.workspaceIds) {
      await this.sweep(workspaceId);
    }
  }

  /**
   * §9 — everything this workspace can start right now, and nothing more.
   *
   * This used to be the body of the event handler, and that was the defect.
   * Dispatch happened on `task.created` and `task.assigned` and nowhere else,
   * so every reason it could decline stranded the task PERMANENTLY: no
   * provider in the catalogue, the concurrency ceiling reached, the daily
   * ceiling reached, no machine attached at that instant. Every one of those
   * conditions is temporary. The stall was not.
   *
   * What that looked like from outside: a workspace with automation on, a
   * machine online, an agent assigned and a task sitting at READY, producing
   * zero commands and no explanation. One line in a log nobody was reading.
   *
   * So the event stays — it is what makes dispatch immediate — and this can
   * also be called again later, by anything that names a workspace. A machine's
   * heartbeat does, which is the right moment: work can only run where a
   * machine is, and a machine saying "I am here" is exactly when to ask what
   * is waiting.
   */
  async sweep(workspaceId: string): Promise<void> {
    /**
     * The dead are buried first — BEFORE asking whether automation is on.
     *
     * That ordering is a correction. Sweeping after the automation check meant
     * a workspace that dispatches by hand never swept at all: seven runs sat
     * RUNNING forever in the development database, and would have sat there
     * however long nobody turned automation on. A run whose machine died is
     * wrong in every workspace, not only in the automatic ones.
     */
    const buried = await this.runs.abandonSilent(workspaceId);
    if (buried > 0) {
      this.logger.warn(
        `${buried} silent run(s) ended in workspace ${workspaceId}; their slots are free.`,
      );
    }

    const limits = await this.policy.limitsFor(workspaceId);
    if (!limits.automatic) {
      return;
    }

    const live = await this.runs.countLive(workspaceId);
    const room = limits.concurrentRuns - live;
    if (room <= 0) {
      // Not an error and not a failure: the work is assigned and waiting, and
      // the next task to finish is what makes room.
      this.logger.log(
        `Holding work in ${workspaceId}: ${live} run(s) in flight, ` +
          `ceiling ${limits.concurrentRuns}.`,
      );
      return;
    }

    const today = await this.runs.countSince(
      workspaceId,
      new Date(this.clock.now().getTime() - A_DAY_MS),
    );
    const left = limits.runsPerDay - today;
    if (left <= 0) {
      this.logger.warn(
        `Automatic dispatch stopped in workspace ${workspaceId}: ${today} run(s) ` +
          `in the last day, ceiling ${limits.runsPerDay}. Work is assigned and ` +
          "waiting for a person.",
      );
      return;
    }

    /**
     * Ready, minus what is already running.
     *
     * Dispatching does not move a task out of READY — it stays ready while
     * its run works — so a sweep that trusted the status alone would start a
     * second run on work already under way, and a third on the next trigger.
     * A runaway is a worse failure than the stall this sweep exists to fix,
     * and this subtraction is the whole guard against it.
     */
    const ready = await this.tasks.awaitingDispatch(
      workspaceId,
      // The ceiling is the most that can ever be in flight here, so a page
      // that size is guaranteed to contain every free slot's candidate.
      limits.concurrentRuns,
    );
    const inFlight = new Set(await this.runs.liveTaskIds(workspaceId, ready));
    const waiting = ready
      .filter((taskId) => !inFlight.has(taskId))
      .slice(0, Math.min(room, left));
    if (waiting.length === 0) {
      return;
    }

    const provider = await this.pickProvider();
    if (!provider) {
      /**
       * Named loudly, because this is the state that made the product look
       * dead: nothing can run because no machine has ever announced what it
       * can drive. It is a configuration fact, not a transient one, and it
       * deserves more than the `log` level it had.
       */
      this.logger.warn(
        `${waiting.length} task(s) are waiting in ${workspaceId} and no provider ` +
          "is available. A machine announces what it can drive when it registers; " +
          "until one does, nothing can be dispatched.",
      );
      return;
    }

    for (const taskId of waiting) {
      const dispatched = await this.dispatch.execute({
        workspaceId,
        taskId,
        provider,
        hubUrl: this.hubUrl,
      });
      if (dispatched.isFailure) {
        /**
         * Refusals here are ordinary and expected: a task that is not
         * dispatchable after all, no machine attached, a workspace with
         * nothing to run on. Logged, never raised — throwing would fail the
         * request that created the task, which is somebody else's act.
         */
        this.logger.log(
          `Not dispatched automatically: ${dispatched.error.message} (task ${taskId})`,
        );
      }
    }
  }

  private async pickProvider(): Promise<string | null> {
    const now = this.clock.now();
    const catalogue = await this.providers.list();
    return catalogue.find((profile) => profile.isAvailableAt(now))?.provider ?? null;
  }
}
