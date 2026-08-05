import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { Result } from "../../../kernel/domain/result";
import { GOAL_REPOSITORY, GoalRepository } from "../../goal/domain/ports/goal.repository.port";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { TASK_REPOSITORY, TaskRepository } from "../../task/domain/ports/task.repository.port";
import {
  WORKSPACE_MEMBERSHIP_REPOSITORY,
  WorkspaceMembershipRepository,
} from "../../identity/domain/ports/identity.repository.ports";
import {
  CheckInCandidate,
  CheckInDue,
  DEFAULT_CHECKPOINT_MS,
  checkInsDue,
} from "../domain/check-in";
import { Schedule, scheduleOf } from "../domain/schedule";

export interface GetScheduleInput {
  workspaceId: string;
  goalId?: string;
}

/**
 * §9.5/§9.7 — what is runnable, in what order, and why the rest is not.
 *
 * Read-only, and nothing is stored: a schedule is a conclusion about a state,
 * so asking for it can never break anything and it can be asked for as often
 * as one likes.
 */
@Injectable()
export class GetScheduleUseCase
  implements UseCase<GetScheduleInput, Result<Schedule, GuardViolation>>
{
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: GetScheduleInput): Promise<Result<Schedule, GuardViolation>> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }

    const tasks = await this.tasks.list({
      workspaceId: workspaceId.value,
      goalId: input.goalId,
      limit: 500,
    });

    // §9.3 lists Goals among the inputs: a task under an objective nobody is
    // pursuing is not work waiting to be done, and offering it would send
    // someone off in a direction the workspace has set aside.
    const live = new Set(
      (await this.goals.list({ workspaceId: workspaceId.value, limit: 500 }))
        .filter((goal) => !["CANCELLED", "COMPLETED"].includes(goal.status))
        .map((goal) => goal.id.value),
    );

    return Result.ok(
      scheduleOf(
        tasks
          .filter((task) => live.has(task.goalId))
          .map((task) => ({
            id: task.id.value,
            goalId: task.goalId,
            title: task.title,
            status: task.status,
            priority: task.priority,
            dependsOn: task.dependsOnTaskIds,
            assignee: task.assignee,
            createdAt: task.createdAt,
          })),
        this.clock.now(),
      ),
    );
  }
}

export interface GetNextForActorInput {
  workspaceId: string;
  actorType: ActorType;
  actorId: string;
  /** §9.16 — a workspace policy, defaulted rather than required. */
  checkpointMs?: number;
}

export interface NextForActor {
  /** The caller's own next task, if there is one. */
  next: Schedule["ready"][number] | null;
  /** Ready work assigned to nobody — §4.6 keeps it explicit, never claimed. */
  unassignedReady: Schedule["ready"];
  summary: Schedule["summary"];
  waiting: Schedule["waiting"];
  /**
   * §9.16 — present when this actor has nothing actionable AND has been
   * silent past the checkpoint. It is the answer to "there is nothing for
   * you" that is not simply nothing.
   */
  checkIn: CheckInDue | null;
}

/**
 * §9.16's REACTIVE half: an actor asking what to do never receives a bare
 * empty list. It receives what is waiting, on what, and whether there is
 * genuinely nothing left.
 *
 * This comment used to claim §9.16 outright, which was the stale-deferral
 * defect the kernel doc records (§5.5): a sentence that reads as done while
 * half the section is missing. The periodic half — "no actionable work AND
 * checkpoint elapsed → check in anyway" — is `GetCheckInsDueUseCase`, and the
 * `checkIn` field below is how a single actor sees it.
 */
@Injectable()
export class GetNextForActorUseCase
  implements UseCase<GetNextForActorInput, Result<NextForActor, GuardViolation>>
{
  constructor(
    private readonly schedule: GetScheduleUseCase,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * When this actor was last given something, derived rather than stored.
   * A stored "last dispatched" would be a second source of truth about
   * assignment, and the two would eventually disagree — the tasks are the
   * record of what was handed out.
   */
  private async lastAssignedAt(workspaceId: string, actor: ActorRef): Promise<Date | null> {
    const assigned = await this.tasks.list({ workspaceId, assignee: actor });
    return assigned.reduce<Date | null>(
      (latest, task) =>
        latest === null || task.createdAt > latest ? task.createdAt : latest,
      null,
    );
  }

  async execute(
    input: GetNextForActorInput,
  ): Promise<Result<NextForActor, GuardViolation>> {
    const actor = ActorRef.create(input.actorType, input.actorId);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }
    const schedule = await this.schedule.execute({ workspaceId: input.workspaceId });
    if (schedule.isFailure) {
      return Result.fail(schedule.error);
    }

    const mine = schedule.value.ready.filter(
      (entry) =>
        entry.assignee?.type === actor.value.type &&
        entry.assignee.id === actor.value.actorId,
    );

    /**
     * §9.16 — when this actor has nothing, is that because the system is up
     * to date, or because it has gone quiet? The two look identical from an
     * empty list, and only the second needs anyone's attention.
     */
    const [checkIn] = checkInsDue(
      [
        {
          actor: { type: actor.value.type, id: actor.value.actorId },
          lastAssignedAt: await this.lastAssignedAt(input.workspaceId, actor.value),
          hasActionableWork: mine.length > 0,
        },
      ],
      input.checkpointMs ?? DEFAULT_CHECKPOINT_MS,
      this.clock.now(),
    );

    return Result.ok({
      checkIn: checkIn ?? null,
      next: mine[0] ?? null,
      // Shown, never handed over: §4.6 makes assignment an explicit act, and
      // two actors picking the same free task is exactly what it prevents.
      unassignedReady: schedule.value.ready.filter((entry) => entry.assignee === null),
      summary: schedule.value.summary,
      waiting: schedule.value.waiting,
    });
  }
}


export interface GetCheckInsDueInput {
  workspaceId: string;
  checkpointMs?: number;
}

/**
 * §9.16's PERIODIC half, at the scale of a workspace.
 *
 * This is the thing that breaks the silence 0.3.10 describes. Every other
 * signal in this system fires when something is wrong; this one fires when
 * nothing is — which is the only way "nobody has asked for new work in two
 * days" ever reaches a person.
 *
 * Read-only and derived: no checkpoint is stored, no cron runs. An operator,
 * a supervising agent or an external timer asks, and the answer is computed
 * against the interval given. Storing it would create a second source of
 * truth about what was handed out, and the two would eventually disagree.
 */
@Injectable()
export class GetCheckInsDueUseCase
  implements UseCase<GetCheckInsDueInput, Result<CheckInDue[], GuardViolation>>
{
  constructor(
    @Inject(WORKSPACE_MEMBERSHIP_REPOSITORY)
    private readonly memberships: WorkspaceMembershipRepository,
    private readonly next: GetNextForActorUseCase,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    input: GetCheckInsDueInput,
  ): Promise<Result<CheckInDue[], GuardViolation>> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }

    const schedule = await this.next.execute({
      workspaceId: workspaceId.value,
      // Any member would do for the shared part; the per-actor answer below
      // is what actually decides. Asked once so the schedule is built once.
      actorType: "SERVICE",
      actorId: "scheduler",
      checkpointMs: input.checkpointMs,
    });
    if (schedule.isFailure) {
      return Result.fail(schedule.error);
    }

    const members = await this.memberships.listByWorkspace(workspaceId.value);
    const candidates: CheckInCandidate[] = [];
    for (const membership of members) {
      const actor = membership.actor;
      const assigned = await this.tasks.list({ workspaceId: workspaceId.value, assignee: actor });
      candidates.push({
        actor: { type: actor.type, id: actor.actorId },
        lastAssignedAt: assigned.reduce<Date | null>(
          (latest, task) =>
            latest === null || task.createdAt > latest ? task.createdAt : latest,
          null,
        ),
        // Actionable means ready and theirs: a task of theirs that is blocked
        // is not something they can act on, and counting it would hide
        // exactly the silence this exists to report.
        hasActionableWork: assigned.some((task) => task.status === "READY" || task.status === "RUNNING"),
      });
    }

    return Result.ok(
      checkInsDue(
        candidates,
        input.checkpointMs ?? DEFAULT_CHECKPOINT_MS,
        this.clock.now(),
      ),
    );
  }
}
