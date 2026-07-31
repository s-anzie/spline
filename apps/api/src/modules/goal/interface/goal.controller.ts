import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import {
  AuthenticatedRequester,
  CurrentRequester,
  JwtAuthGuard,
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface";
import { DomainError } from "../../../kernel/domain/domain-error";
import { ChangeGoalStatusUseCase } from "../application/change-goal-status.use-case";
import { CreateGoalUseCase } from "../application/create-goal.use-case";
import { GetGoalUseCase } from "../application/get-goal.use-case";
import {
  CircularGoalDependencyError,
  DependencyGoalNotFoundError,
  GoalNotFoundError,
} from "../application/goal-application.errors";
import { ListGoalsByWorkspaceUseCase } from "../application/list-goals-by-workspace.use-case";
import { RejectGoalUseCase } from "../application/reject-goal.use-case";
import { ReportGoalBlockerUseCase } from "../application/report-goal-blocker.use-case";
import { UpdateGoalDetailsUseCase } from "../application/update-goal-details.use-case";
import { ValidateGoalUseCase } from "../application/validate-goal.use-case";
import { Goal } from "../domain/goal";
import {
  EmptyBlockerReasonError,
  GoalValidationNotPendingError,
  InvalidGoalStatusTransitionError,
  SelfGoalDependencyError,
} from "../domain/goal.errors";
import { ChangeGoalStatusDto } from "./dto/change-goal-status.dto";
import { CreateGoalDto } from "./dto/create-goal.dto";
import { ReportGoalBlockerDto } from "./dto/report-goal-blocker.dto";
import { UpdateGoalDetailsDto } from "./dto/update-goal-details.dto";

function toGoalResponse(goal: Goal) {
  return {
    id: goal.id.toString(),
    workspaceId: goal.workspaceId,
    title: goal.title,
    description: goal.description ?? null,
    status: goal.status,
    priority: goal.priority,
    ownerType: goal.ownerType,
    ownerId: goal.ownerId,
    successCriteria: goal.successCriteria,
    progressPercentage: goal.progressPercentage,
    startDate: goal.startDate?.toISOString() ?? null,
    dueDate: goal.dueDate?.toISOString() ?? null,
    dependencies: goal.dependencies,
    blockers: goal.blockers,
    validationState: goal.validationState,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  };
}

function toHttpError(error: DomainError): Error {
  if (error instanceof GoalNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof InvalidGoalStatusTransitionError || error instanceof GoalValidationNotPendingError) {
    return new BadRequestException(error.message);
  }
  if (
    error instanceof DependencyGoalNotFoundError ||
    error instanceof CircularGoalDependencyError ||
    error instanceof SelfGoalDependencyError ||
    error instanceof EmptyBlockerReasonError
  ) {
    return new BadRequestException(error.message);
  }
  return new BadRequestException(error.message);
}

@Controller("workspaces/:workspaceId/goals")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GoalController {
  constructor(
    private readonly createGoalUseCase: CreateGoalUseCase,
    private readonly getGoalUseCase: GetGoalUseCase,
    private readonly listGoalsByWorkspaceUseCase: ListGoalsByWorkspaceUseCase,
    private readonly updateGoalDetailsUseCase: UpdateGoalDetailsUseCase,
    private readonly changeGoalStatusUseCase: ChangeGoalStatusUseCase,
    private readonly validateGoalUseCase: ValidateGoalUseCase,
    private readonly rejectGoalUseCase: RejectGoalUseCase,
    private readonly reportGoalBlockerUseCase: ReportGoalBlockerUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async create(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: CreateGoalDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.createGoalUseCase.execute({
      ...dto,
      workspaceId,
      ownerType: requester.type,
      ownerId: requester.id,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toGoalResponse(result.value);
  }

  @Get()
  @RequirePermission("read_tasks")
  async list(@Param("workspaceId") workspaceId: string) {
    const goals = await this.listGoalsByWorkspaceUseCase.execute(workspaceId);
    return goals.map(toGoalResponse);
  }

  @Get(":goalId")
  @RequirePermission("read_tasks")
  async get(@Param("goalId") goalId: string) {
    const result = await this.getGoalUseCase.execute(goalId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toGoalResponse(result.value);
  }

  @Patch(":goalId")
  @RequirePermission("create_task")
  async update(@Param("goalId") goalId: string, @Body() dto: UpdateGoalDetailsDto) {
    const result = await this.updateGoalDetailsUseCase.execute({ goalId, ...dto });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toGoalResponse(result.value);
  }

  @Post(":goalId/status")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async changeStatus(@Param("goalId") goalId: string, @Body() dto: ChangeGoalStatusDto) {
    const result = await this.changeGoalStatusUseCase.execute({ goalId, status: dto.status });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toGoalResponse(result.value);
  }

  @Post(":goalId/blockers")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async reportBlocker(
    @Param("goalId") goalId: string,
    @Body() dto: ReportGoalBlockerDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.reportGoalBlockerUseCase.execute({
      goalId,
      reason: dto.reason,
      reporterType: requester.type,
      reporterId: requester.id,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toGoalResponse(result.value);
  }

  @Post(":goalId/validate")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("validate_decision")
  async validate(@Param("goalId") goalId: string) {
    const result = await this.validateGoalUseCase.execute(goalId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toGoalResponse(result.value);
  }

  @Post(":goalId/reject")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("validate_decision")
  async reject(@Param("goalId") goalId: string) {
    const result = await this.rejectGoalUseCase.execute(goalId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toGoalResponse(result.value);
  }
}
