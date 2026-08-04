import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { Result } from "../../../kernel/domain/result";
import { GOAL_REPOSITORY, GoalRepository } from "../../goal/domain/ports/goal.repository.port";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { TASK_REPOSITORY, TaskRepository } from "../../task/domain/ports/task.repository.port";
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
}

export interface NextForActor {
  /** The caller's own next task, if there is one. */
  next: Schedule["ready"][number] | null;
  /** Ready work assigned to nobody — §4.6 keeps it explicit, never claimed. */
  unassignedReady: Schedule["ready"];
  summary: Schedule["summary"];
  waiting: Schedule["waiting"];
}

/**
 * §9.16 — "un système entièrement à jour finit par se taire pour de bon,
 * sans qu'aucun signal n'indique à personne qu'un nouveau travail est
 * nécessaire".
 *
 * The reactive half of that section needs someone to wake; this is the other
 * half, and it is the one that removes the silence: an actor asking what to
 * do never receives a bare empty list. It receives what is waiting, on what,
 * and whether there is genuinely nothing left.
 */
@Injectable()
export class GetNextForActorUseCase
  implements UseCase<GetNextForActorInput, Result<NextForActor, GuardViolation>>
{
  constructor(private readonly schedule: GetScheduleUseCase) {}

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
    return Result.ok({
      next: mine[0] ?? null,
      // Shown, never handed over: §4.6 makes assignment an explicit act, and
      // two actors picking the same free task is exactly what it prevents.
      unassignedReady: schedule.value.ready.filter((entry) => entry.assignee === null),
      summary: schedule.value.summary,
      waiting: schedule.value.waiting,
    });
  }
}
