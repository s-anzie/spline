import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  GoneException,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { ActorIdentity } from "../../identity/application/permissions.service";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import { ChangeGoalStatusUseCase } from "../application/change-goal-status.use-case";
import { ManageGoalDependencyUseCase } from "../application/manage-goal-dependency.use-case";
import { CompleteGoalUseCase } from "../application/complete-goal.use-case";
import { CreateGoalUseCase } from "../application/create-goal.use-case";
import { GetGoalUseCase } from "../application/get-goal.use-case";
import { ListGoalsUseCase } from "../application/list-goals.use-case";
import { UpdateGoalDetailsUseCase } from "../application/update-goal-details.use-case";
import { UpdateGoalProgressUseCase } from "../application/update-goal-progress.use-case";
import { Goal } from "../domain/goal";
import {
  ChangeGoalStatusDto,
  CreateGoalDto,
  ManageGoalDependencyDto,
  UpdateGoalDto,
  UpdateGoalProgressDto,
} from "./dto/goal.dtos";

interface GoalView {
  id: string;
  workspaceId: string;
  parentGoalId: string | null;
  title: string;
  description: string | null;
  successCriteria: readonly string[];
  dependsOnGoalIds: readonly string[];
  priority: string;
  owner: { type: string; id: string };
  progress: number;
  status: string;
  /** §20.6 — COMPLETED is never listed: completion is an approval. */
  allowedStatusTargets: readonly string[];
  createdAt: string;
  updatedAt: string;
}

function toView(goal: Goal): GoalView {
  return {
    id: goal.id.value,
    workspaceId: goal.workspaceId,
    parentGoalId: goal.parentGoalId,
    title: goal.title,
    description: goal.description,
    successCriteria: goal.successCriteria,
    dependsOnGoalIds: goal.dependsOnGoalIds,
    priority: goal.priority,
    owner: { type: goal.owner.type, id: goal.owner.actorId },
    progress: goal.progress,
    status: goal.status,
    allowedStatusTargets: goal.allowedStatusTargets(),
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  };
}

@Controller("workspaces/:workspaceId/goals")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class GoalController {
  constructor(
    private readonly createGoal: CreateGoalUseCase,
    private readonly getGoal: GetGoalUseCase,
    private readonly listGoals: ListGoalsUseCase,
    private readonly updateGoal: UpdateGoalDetailsUseCase,
    private readonly changeStatus: ChangeGoalStatusUseCase,
    private readonly completeGoal: CompleteGoalUseCase,
    private readonly updateProgress: UpdateGoalProgressUseCase,
    private readonly manageDependency: ManageGoalDependencyUseCase,
  ) {}

  @Post()
  @RequirePermission("manage_goals")
  async create(
    @Param("workspaceId") workspaceId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: CreateGoalDto,
  ): Promise<{ goalId: string }> {
    const result = await this.createGoal.execute({
      workspaceId,
      ...dto,
      ownerType: actor.actorType,
      ownerId: actor.actorId,
    });
    if (result.isFailure) {
      if (
        result.error.name === "WorkspaceNotFoundError" ||
        result.error.name === "GoalNotFoundError"
      ) {
        throw new NotFoundException(result.error.message);
      }
      throw new BadRequestException(result.error.message);
    }
    return result.value;
  }

  @Get()
  @RequirePermission("read_workspace_state")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query("parentGoalId") parentGoalId?: string,
  ): Promise<GoalView[]> {
    const result = await this.listGoals.execute({
      workspaceId,
      // "root" is the explicit way to ask for top-level goals only.
      ...(parentGoalId !== undefined && {
        parentGoalId: parentGoalId === "root" ? null : parentGoalId,
      }),
    });
    return result.value.map(toView);
  }

  @Get(":goalId")
  @RequirePermission("read_workspace_state")
  async get(
    @Param("workspaceId") workspaceId: string,
    @Param("goalId") goalId: string,
  ): Promise<GoalView> {
    const result = await this.getGoal.execute({ goalId, workspaceId });
    if (result.isFailure) {
      throw new NotFoundException(result.error.message);
    }
    return toView(result.value);
  }

  @Patch(":goalId")
  @RequirePermission("manage_goals")
  async update(
    @Param("workspaceId") workspaceId: string,
    @Param("goalId") goalId: string,
    @Body() dto: UpdateGoalDto,
  ): Promise<{ ok: true }> {
    const result = await this.updateGoal.execute({ goalId, workspaceId, ...dto });
    if (result.isFailure) {
      if (result.error.name === "GoalNotFoundError") {
        throw new NotFoundException(result.error.message);
      }
      throw new BadRequestException(result.error.message);
    }
    return { ok: true };
  }

  @Post(":goalId/status")
  @HttpCode(200)
  @RequirePermission("manage_goals")
  async status(
    @Param("workspaceId") workspaceId: string,
    @Param("goalId") goalId: string,
    @Body() dto: ChangeGoalStatusDto,
  ): Promise<{ ok: true }> {
    const result = await this.changeStatus.execute({
      goalId,
      workspaceId,
      status: dto.status,
    });
    if (result.isFailure) {
      if (result.error.name === "GoalNotFoundError") {
        throw new NotFoundException(result.error.message);
      }
      if (result.error.name === "CompletionRequiresApprovalError") {
        throw new BadRequestException(result.error.message);
      }
      if (result.error.name === "UnsatisfiedDependenciesError") {
        throw new ConflictException(result.error.message);
      }
      const transition = result.error as InvalidStateTransitionError;
      throw transition.fromTerminal
        ? new GoneException(transition.message)
        : new ConflictException(transition.message);
    }
    return { ok: true };
  }

  /**
   * Completion is an approval, not a status pick: an agent manager brings a
   * goal to REVIEW, only a human holding approve_validation closes it
   * (§10.9/§11 — encoded in the route, not only in the matrix).
   */
  @Post(":goalId/complete")
  @HttpCode(200)
  @RequirePermission("approve_validation")
  async complete(
    @Param("workspaceId") workspaceId: string,
    @Param("goalId") goalId: string,
  ): Promise<{ ok: true }> {
    const result = await this.completeGoal.execute({ goalId, workspaceId });
    if (result.isFailure) {
      if (result.error.name === "GoalNotFoundError") {
        throw new NotFoundException(result.error.message);
      }
      if (result.error.name === "OpenChildrenError") {
        throw new ConflictException(result.error.message);
      }
      const transition = result.error as InvalidStateTransitionError;
      throw transition.fromTerminal
        ? new GoneException(transition.message)
        : new ConflictException(transition.message);
    }
    return { ok: true };
  }

  @Post(":goalId/progress")
  @HttpCode(200)
  @RequirePermission("manage_goals")
  async progress(
    @Param("goalId") goalId: string,
    @Body() dto: UpdateGoalProgressDto,
  ): Promise<{ ok: true }> {
    const result = await this.updateProgress.execute({ goalId, progress: dto.progress });
    if (result.isFailure) {
      if (result.error.name === "GoalNotFoundError") {
        throw new NotFoundException(result.error.message);
      }
      throw new BadRequestException(result.error.message);
    }
    return { ok: true };
  }

  @Post(":goalId/dependencies")
  @HttpCode(200)
  @RequirePermission("manage_goals")
  async addDependency(
    @Param("workspaceId") workspaceId: string,
    @Param("goalId") goalId: string,
    @Body() dto: ManageGoalDependencyDto,
  ): Promise<{ ok: true }> {
    return this.dependency(workspaceId, goalId, dto.dependsOnGoalId, "add");
  }

  @Delete(":goalId/dependencies/:dependsOnGoalId")
  @HttpCode(200)
  @RequirePermission("manage_goals")
  async removeDependency(
    @Param("workspaceId") workspaceId: string,
    @Param("goalId") goalId: string,
    @Param("dependsOnGoalId") dependsOnGoalId: string,
  ): Promise<{ ok: true }> {
    return this.dependency(workspaceId, goalId, dependsOnGoalId, "remove");
  }

  private async dependency(
    workspaceId: string,
    goalId: string,
    dependsOnGoalId: string,
    operation: "add" | "remove",
  ): Promise<{ ok: true }> {
    const result = await this.manageDependency.execute({
      goalId,
      workspaceId,
      dependsOnGoalId,
      operation,
    });
    if (result.isFailure) {
      if (result.error.name === "GoalNotFoundError") {
        throw new NotFoundException(result.error.message);
      }
      if (result.error.name === "GoalDependencyError") {
        throw new ConflictException(result.error.message);
      }
      throw new BadRequestException(result.error.message);
    }
    return { ok: true };
  }
}
