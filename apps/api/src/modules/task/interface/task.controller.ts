import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  Param,
  Patch,
  Post,
  Query,
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
import { AssignTaskUseCase } from "../application/assign-task.use-case";
import { ChangeTaskStatusUseCase } from "../application/change-task-status.use-case";
import { CreateTaskUseCase } from "../application/create-task.use-case";
import { GetTaskUseCase } from "../application/get-task.use-case";
import { ListTasksByWorkspaceUseCase } from "../application/list-tasks-by-workspace.use-case";
import { RejectTaskUseCase } from "../application/reject-task.use-case";
import { ReportTaskBlockerUseCase } from "../application/report-task-blocker.use-case";
import {
  DependencyTaskNotFoundError,
  GoalNotInWorkspaceError,
  TaskNotFoundError,
  UnmetTaskDependenciesError,
} from "../application/task-application.errors";
import { UpdateTaskDetailsUseCase } from "../application/update-task-details.use-case";
import { ValidateTaskUseCase } from "../application/validate-task.use-case";
import { Task } from "../domain/task";
import {
  EmptyBlockerReasonError,
  InvalidTaskStatusTransitionError,
  SelfTaskDependencyError,
  TaskValidationNotPendingError,
} from "../domain/task.errors";
import { AssignTaskDto } from "./dto/assign-task.dto";
import { ChangeTaskStatusDto } from "./dto/change-task-status.dto";
import { CreateTaskDto } from "./dto/create-task.dto";
import { ReportTaskBlockerDto } from "./dto/report-task-blocker.dto";
import { UpdateTaskDetailsDto } from "./dto/update-task-details.dto";

function toTaskResponse(task: Task) {
  return {
    id: task.id.toString(),
    workspaceId: task.workspaceId,
    goalId: task.goalId ?? null,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    assigneeType: task.assigneeType ?? null,
    assigneeId: task.assigneeId ?? null,
    dependencies: task.dependencies,
    blockers: task.blockers,
    validationState: task.validationState,
    createdByType: task.createdByType,
    createdById: task.createdById,
    updatedByType: task.updatedByType ?? null,
    updatedById: task.updatedById ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function toHttpError(error: DomainError): Error {
  if (error instanceof TaskNotFoundError || error instanceof GoalNotInWorkspaceError) {
    return new NotFoundException(error.message);
  }
  if (
    error instanceof InvalidTaskStatusTransitionError ||
    error instanceof TaskValidationNotPendingError ||
    error instanceof UnmetTaskDependenciesError
  ) {
    return new ConflictException(error.message);
  }
  if (
    error instanceof DependencyTaskNotFoundError ||
    error instanceof SelfTaskDependencyError ||
    error instanceof EmptyBlockerReasonError
  ) {
    return new BadRequestException(error.message);
  }
  return new BadRequestException(error.message);
}

@Controller("workspaces/:workspaceId/tasks")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TaskController {
  constructor(
    private readonly createTaskUseCase: CreateTaskUseCase,
    private readonly getTaskUseCase: GetTaskUseCase,
    private readonly listTasksByWorkspaceUseCase: ListTasksByWorkspaceUseCase,
    private readonly updateTaskDetailsUseCase: UpdateTaskDetailsUseCase,
    private readonly assignTaskUseCase: AssignTaskUseCase,
    private readonly changeTaskStatusUseCase: ChangeTaskStatusUseCase,
    private readonly validateTaskUseCase: ValidateTaskUseCase,
    private readonly rejectTaskUseCase: RejectTaskUseCase,
    private readonly reportTaskBlockerUseCase: ReportTaskBlockerUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async create(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: CreateTaskDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.createTaskUseCase.execute({
      ...dto,
      workspaceId,
      createdByType: requester.type,
      createdById: requester.id,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toTaskResponse(result.value);
  }

  @Get()
  @RequirePermission("read_tasks")
  async list(@Param("workspaceId") workspaceId: string, @Query("goalId") goalId?: string) {
    const tasks = await this.listTasksByWorkspaceUseCase.execute(workspaceId, goalId);
    return tasks.map(toTaskResponse);
  }

  @Get(":taskId")
  @RequirePermission("read_tasks")
  async get(@Param("taskId") taskId: string) {
    const result = await this.getTaskUseCase.execute(taskId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toTaskResponse(result.value);
  }

  @Patch(":taskId")
  @RequirePermission("create_task")
  async update(
    @Param("taskId") taskId: string,
    @Body() dto: UpdateTaskDetailsDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.updateTaskDetailsUseCase.execute({
      taskId,
      ...dto,
      updatedByType: requester.type,
      updatedById: requester.id,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toTaskResponse(result.value);
  }

  @Post(":taskId/assign")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async assign(
    @Param("taskId") taskId: string,
    @Body() dto: AssignTaskDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.assignTaskUseCase.execute({
      taskId,
      ...dto,
      updatedByType: requester.type,
      updatedById: requester.id,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toTaskResponse(result.value);
  }

  @Post(":taskId/status")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async changeStatus(
    @Param("taskId") taskId: string,
    @Body() dto: ChangeTaskStatusDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.changeTaskStatusUseCase.execute({
      taskId,
      status: dto.status,
      updatedByType: requester.type,
      updatedById: requester.id,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toTaskResponse(result.value);
  }

  @Post(":taskId/blockers")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async reportBlocker(
    @Param("taskId") taskId: string,
    @Body() dto: ReportTaskBlockerDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.reportTaskBlockerUseCase.execute({
      taskId,
      reason: dto.reason,
      reporterType: requester.type,
      reporterId: requester.id,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toTaskResponse(result.value);
  }

  @Post(":taskId/validate")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("validate_decision")
  async validate(
    @Param("taskId") taskId: string,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.validateTaskUseCase.execute({
      taskId,
      updatedByType: requester.type,
      updatedById: requester.id,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toTaskResponse(result.value);
  }

  @Post(":taskId/reject")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("validate_decision")
  async reject(
    @Param("taskId") taskId: string,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.rejectTaskUseCase.execute({
      taskId,
      updatedByType: requester.type,
      updatedById: requester.id,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toTaskResponse(result.value);
  }
}
