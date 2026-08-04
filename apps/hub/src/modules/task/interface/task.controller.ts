import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { ActorIdentity } from "../../identity/application/permissions.service";
import { ActorType } from "../../identity/domain/actor";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import { AssignTaskUseCase } from "../application/assign-task.use-case";
import { ChangeTaskStatusUseCase } from "../application/change-task-status.use-case";
import { CompleteTaskUseCase } from "../application/complete-task.use-case";
import { CreateTaskUseCase } from "../application/create-task.use-case";
import { GetTaskUseCase } from "../application/get-task.use-case";
import { ListTasksUseCase } from "../application/list-tasks.use-case";
import { ManageTaskDependencyUseCase } from "../application/manage-task-dependency.use-case";
import { ReportBlockerUseCase } from "../application/report-blocker.use-case";
import { ResolveBlockerUseCase } from "../application/resolve-blocker.use-case";
import { UpdateTaskDetailsUseCase } from "../application/update-task-details.use-case";
import { Task, TaskStatus } from "../domain/task";
import {
  AssignTaskDto,
  ChangeTaskStatusDto,
  CreateTaskDto,
  ManageTaskDependencyDto,
  ReportBlockerDto,
  ResolveBlockerDto,
  UpdateTaskDto,
} from "./dto/task.dtos";

interface BlockerView {
  id: string;
  type: string;
  description: string;
  reportedBy: { type: string; id: string };
  reportedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

interface TaskView {
  id: string;
  workspaceId: string;
  goalId: string;
  repositoryId: string | null;
  title: string;
  description: string | null;
  acceptanceCriteria: readonly string[];
  dependsOnTaskIds: readonly string[];
  assignee: { type: string; id: string };
  priority: string;
  status: string;
  blockers: BlockerView[];
  openBlockerCount: number;
  /** §20.6 — COMPLETED is never listed: completion is an approval. */
  allowedStatusTargets: readonly string[];
  estimatedCost: number | null;
  estimatedDurationMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

function toView(task: Task): TaskView {
  return {
    id: task.id.value,
    workspaceId: task.workspaceId,
    goalId: task.goalId,
    repositoryId: task.repositoryId,
    title: task.title,
    description: task.description,
    acceptanceCriteria: task.acceptanceCriteria,
    dependsOnTaskIds: task.dependsOnTaskIds,
    assignee: { type: task.assignee.type, id: task.assignee.actorId },
    priority: task.priority,
    status: task.status,
    blockers: task.blockers.map((blocker) => ({
      id: blocker.id,
      type: blocker.type,
      description: blocker.description,
      reportedBy: { type: blocker.reportedBy.type, id: blocker.reportedBy.actorId },
      reportedAt: blocker.reportedAt.toISOString(),
      resolvedAt: blocker.resolvedAt?.toISOString() ?? null,
      resolution: blocker.resolution,
    })),
    openBlockerCount: task.openBlockers.length,
    allowedStatusTargets: task.allowedStatusTargets(),
    estimatedCost: task.estimatedCost,
    estimatedDurationMinutes: task.estimatedDurationMinutes,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

@Controller("workspaces/:workspaceId/tasks")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class TaskController {
  constructor(
    private readonly createTask: CreateTaskUseCase,
    private readonly getTask: GetTaskUseCase,
    private readonly listTasks: ListTasksUseCase,
    private readonly updateTask: UpdateTaskDetailsUseCase,
    private readonly assignTask: AssignTaskUseCase,
    private readonly changeStatus: ChangeTaskStatusUseCase,
    private readonly completeTask: CompleteTaskUseCase,
    private readonly reportBlocker: ReportBlockerUseCase,
    private readonly resolveBlocker: ResolveBlockerUseCase,
    private readonly manageDependency: ManageTaskDependencyUseCase,
  ) {}

  @Post()
  @RequirePermission("manage_tasks")
  async create(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: CreateTaskDto,
  ): Promise<{ taskId: string }> {
    const result = await this.createTask.execute({ workspaceId, ...dto });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        forbidden: ["AssigneeNotInWorkspaceError", "AssigneeCannotExecuteError"],
      });
    }
    return result.value;
  }

  @Get()
  @RequirePermission("read_workspace_state")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query("goalId") goalId?: string,
    @Query("status") status?: TaskStatus,
    @Query("assigneeType") assigneeType?: ActorType,
    @Query("assigneeId") assigneeId?: string,
  ): Promise<TaskView[]> {
    const result = await this.listTasks.execute({
      workspaceId,
      ...(goalId !== undefined && { goalId }),
      ...(status !== undefined && { statuses: [status] }),
      ...(assigneeType !== undefined && { assigneeType }),
      ...(assigneeId !== undefined && { assigneeId }),
    });
    return result.value.map(toView);
  }

  /** The caller's own queue — what an agent asks for on wake-up. */
  @Get("mine")
  @RequirePermission("read_workspace_state")
  async listMine(
    @Param("workspaceId") workspaceId: string,
    @CurrentActor() actor: ActorIdentity,
  ): Promise<TaskView[]> {
    const result = await this.listTasks.execute({
      workspaceId,
      assigneeType: actor.actorType,
      assigneeId: actor.actorId,
    });
    return result.value.map(toView);
  }

  @Get(":taskId")
  @RequirePermission("read_workspace_state")
  async get(
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
  ): Promise<TaskView> {
    const result = await this.getTask.execute({ taskId, workspaceId });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return toView(result.value);
  }

  @Patch(":taskId")
  @RequirePermission("manage_tasks")
  async update(
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<{ ok: true }> {
    return this.unwrap(await this.updateTask.execute({ taskId, workspaceId, ...dto }));
  }

  @Post(":taskId/assign")
  @HttpCode(200)
  @RequirePermission("manage_tasks")
  async assign(
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Body() dto: AssignTaskDto,
  ): Promise<{ ok: true }> {
    return this.unwrap(await this.assignTask.execute({ taskId, workspaceId, ...dto }));
  }

  /** The assignee drives their own work forward. */
  @Post(":taskId/status")
  @HttpCode(200)
  @RequirePermission("execute_tasks")
  async status(
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Body() dto: ChangeTaskStatusDto,
  ): Promise<{ ok: true }> {
    return this.unwrap(
      await this.changeStatus.execute({ taskId, workspaceId, status: dto.status }),
    );
  }

  /** Submitting for validation — an agent never validates its own work (§10.9). */
  @Post(":taskId/submit")
  @HttpCode(200)
  @RequirePermission("request_validation")
  async submit(
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
  ): Promise<{ ok: true }> {
    return this.unwrap(
      await this.changeStatus.execute({ taskId, workspaceId, status: "VALIDATING" }),
    );
  }

  /** Completion is an approval, reserved to humans by the matrix (§11). */
  @Post(":taskId/complete")
  @HttpCode(200)
  @RequirePermission("approve_validation")
  async complete(
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
  ): Promise<{ ok: true }> {
    return this.unwrap(await this.completeTask.execute({ taskId, workspaceId }));
  }

  @Post(":taskId/cancel")
  @HttpCode(200)
  @RequirePermission("manage_tasks")
  async cancel(
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
  ): Promise<{ ok: true }> {
    return this.unwrap(
      await this.changeStatus.execute({ taskId, workspaceId, status: "CANCELLED" }),
    );
  }

  /** Whoever hits the obstacle reports it… */
  @Post(":taskId/blockers")
  @RequirePermission("execute_tasks")
  async blocker(
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: ReportBlockerDto,
  ): Promise<{ blockerId: string }> {
    const result = await this.reportBlocker.execute({
      taskId,
      workspaceId,
      ...dto,
      reporterType: actor.actorType,
      reporterId: actor.actorId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
  }

  /** …whoever steers clears it: an executor must not bury their own obstacles. */
  @Post(":taskId/blockers/:blockerId/resolve")
  @HttpCode(200)
  @RequirePermission("manage_tasks")
  async unblock(
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Param("blockerId") blockerId: string,
    @Body() dto: ResolveBlockerDto,
  ): Promise<{ ok: true }> {
    return this.unwrap(
      await this.resolveBlocker.execute({
        taskId,
        workspaceId,
        blockerId,
        resolution: dto.resolution,
      }),
    );
  }

  @Post(":taskId/dependencies")
  @HttpCode(200)
  @RequirePermission("manage_tasks")
  async addDependency(
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Body() dto: ManageTaskDependencyDto,
  ): Promise<{ ok: true }> {
    return this.dependency(workspaceId, taskId, dto.dependsOnTaskId, "add");
  }

  @Delete(":taskId/dependencies/:dependsOnTaskId")
  @HttpCode(200)
  @RequirePermission("manage_tasks")
  async removeDependency(
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Param("dependsOnTaskId") dependsOnTaskId: string,
  ): Promise<{ ok: true }> {
    return this.dependency(workspaceId, taskId, dependsOnTaskId, "remove");
  }

  private async dependency(
    workspaceId: string,
    taskId: string,
    dependsOnTaskId: string,
    operation: "add" | "remove",
  ): Promise<{ ok: true }> {
    const result = await this.manageDependency.execute({
      taskId,
      workspaceId,
      dependsOnTaskId,
      operation,
    });
    if (result.isFailure) {
      throw toHttpException(result.error, { conflicts: ["TaskDependencyError"] });
    }
    return { ok: true };
  }

  /** Task-specific classifications; the universal rules live in the kernel. */
  private unwrap(result: {
    isFailure: boolean;
    error: { name: string; message: string };
  }): { ok: true } {
    if (!result.isFailure) {
      return { ok: true };
    }
    throw toHttpException(result.error, {
      conflicts: ["UnsatisfiedTaskDependenciesError", "BlockerAlreadyResolvedError"],
      forbidden: ["AssigneeNotInWorkspaceError", "AssigneeCannotExecuteError"],
    });
  }
}
