import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";

import { PRIORITIES, Priority } from "../../../kernel/domain/priority";

import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { ActorIdentity } from "../../identity/application/permissions.service";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import { PreemptForTaskUseCase } from "../application/preempt.use-case";
import {
  GetCheckInsDueUseCase,
  GetNextForActorUseCase,
  GetScheduleUseCase,
} from "../application/schedule.use-cases";
import { Schedule } from "../domain/schedule";

export class PreemptDto {
  @IsString()
  @IsNotEmpty()
  claimantTaskId!: string;

  @IsIn(PRIORITIES)
  claimantPriority!: Priority;
}

export class CheckInQueryDto {
  /** §9.16 — a workspace policy. Absent means the default checkpoint. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60_000)
  checkpointMs?: number;
}

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
    private readonly preemptFor: PreemptForTaskUseCase,
    private readonly checkInsDue: GetCheckInsDueUseCase,
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
  /**
   * §9.14 — makes room for an urgent task by interrupting a less urgent one.
   *
   * Declared BEFORE the parametric reads below (there are none here today,
   * but the shadowing invariant exists because that changed once already).
   * `manage_tasks` rather than `execute_tasks`: interrupting somebody else's
   * work is an act of scheduling, not of execution, and no agent role holds
   * it.
   */
  @Post("preempt")
  @HttpCode(200)
  @RequirePermission("manage_tasks")
  async preempt(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: PreemptDto,
  ) {
    const result = await this.preemptFor.execute({
      workspaceId,
      claimantTaskId: dto.claimantTaskId,
      claimantPriority: dto.claimantPriority,
    });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        conflicts: ["NoPreemptableTaskError"],
      });
    }
    return result.value;
  }

  /**
   * §9.16 — who has gone quiet. The one signal in this system that fires when
   * nothing is wrong, because "up to date" and "abandoned" look identical
   * from an empty queue (0.3.10).
   */
  @Get("check-ins")
  @RequirePermission("read_workspace_state")
  async checkIns(
    @Param("workspaceId") workspaceId: string,
    @Query() query: CheckInQueryDto,
  ) {
    const result = await this.checkInsDue.execute({
      workspaceId,
      checkpointMs: query.checkpointMs,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
  }

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
      /**
       * §9.16 — present when this actor has nothing AND has gone quiet past
       * the checkpoint. An empty `next` alone cannot tell "the system is up
       * to date" from "nobody has asked for work in two days" (0.3.10).
       */
      checkIn: result.value.checkIn,
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
