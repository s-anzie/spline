import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { ActorIdentity } from "../../identity/application/permissions.service";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import {
  GetNextForActorUseCase,
  GetScheduleUseCase,
} from "../application/schedule.use-cases";
import { Schedule } from "../domain/schedule";

export class ScheduleQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  goalId?: string;
}

function toView(schedule: Schedule) {
  return {
    /** Ordered by written precedence, never by a score (§10.18d). */
    ready: schedule.ready.map((entry) => ({
      taskId: entry.id,
      goalId: entry.goalId,
      title: entry.title,
      priority: entry.priority,
      unblocks: entry.unblocks,
      assignee: entry.assignee,
    })),
    /** §17.8 — what is waiting, and on what, named. */
    waiting: schedule.waiting.map((entry) => ({
      taskId: entry.id,
      title: entry.title,
      blockedBy: entry.blockedBy,
    })),
    cycles: schedule.cycles,
    summary: schedule.summary,
  };
}

@Controller("workspaces/:workspaceId/schedule")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class SchedulingController {
  constructor(
    private readonly schedule: GetScheduleUseCase,
    private readonly next: GetNextForActorUseCase,
  ) {}

  /** §9.5/§9.7 — the workspace's queue. Reading it cannot change anything. */
  @Get()
  @RequirePermission("read_workspace_state")
  async get(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ScheduleQueryDto,
  ) {
    const result = await this.schedule.execute({ workspaceId, goalId: query.goalId });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return toView(result.value);
  }

  /**
   * §9.16 — "what should I do?", answered usefully even when the answer is
   * "nothing". An empty list teaches nobody anything, and a system fully up
   * to date then goes quiet for good.
   */
  @Get("mine")
  @RequirePermission("read_workspace_state")
  async mine(
    @Param("workspaceId") workspaceId: string,
    @CurrentActor() actor: ActorIdentity,
  ) {
    const result = await this.next.execute({
      workspaceId,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return {
      next: result.value.next
        ? {
            taskId: result.value.next.id,
            goalId: result.value.next.goalId,
            title: result.value.next.title,
            priority: result.value.next.priority,
          }
        : null,
      /** Shown, never claimed: assignment stays an explicit act (§4.6). */
      unassignedReady: result.value.unassignedReady.map((entry) => ({
        taskId: entry.id,
        title: entry.title,
        priority: entry.priority,
      })),
      waiting: result.value.waiting.map((entry) => ({
        taskId: entry.id,
        title: entry.title,
        blockedBy: entry.blockedBy,
      })),
      summary: result.value.summary,
    };
  }
}
