import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Priority } from "../../../kernel/domain/priority";
import { GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { GoalNotFoundError } from "../../goal/domain/goal.errors";
import { GOAL_REPOSITORY, GoalRepository } from "../../goal/domain/ports/goal.repository.port";
import { PermissionsService } from "../../identity/application/permissions.service";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../../workspace/domain/ports/workspace.repository.port";
import {
  WorkspaceNotActiveError,
  WorkspaceNotFoundError,
} from "../../workspace/domain/workspace.errors";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { CreateTaskError, Task } from "../domain/task";
import {
  AssigneeCannotExecuteError,
  AssigneeNotInWorkspaceError,
  TaskGoalError,
} from "./task-application.errors";

export interface CreateTaskInput {
  workspaceId: string;
  goalId: string;
  repositoryId?: string;
  title: string;
  description?: string;
  acceptanceCriteria: readonly string[];
  priority?: Priority;
  estimatedCost?: number;
  estimatedDurationMinutes?: number;
  assigneeType: ActorType;
  assigneeId: string;
}

export interface CreateTaskOutput {
  taskId: string;
}

export type CreateTaskUseCaseError =
  | CreateTaskError
  | WorkspaceNotFoundError
  | WorkspaceNotActiveError
  | GoalNotFoundError
  | TaskGoalError
  | AssigneeNotInWorkspaceError
  | AssigneeCannotExecuteError;

@Injectable()
export class CreateTaskUseCase
  implements UseCase<CreateTaskInput, Result<CreateTaskOutput, CreateTaskUseCaseError>>
{
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    private readonly permissions: PermissionsService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: CreateTaskInput,
  ): Promise<Result<CreateTaskOutput, CreateTaskUseCaseError>> {
    const workspace = await this.workspaces.findById(input.workspaceId);
    if (!workspace || workspace.status === "DELETED") {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }
    if (workspace.status !== "ACTIVE") {
      return Result.fail(new WorkspaceNotActiveError(workspace.status));
    }

    const goal = await this.goals.findById(input.goalId);
    if (!goal) {
      return Result.fail(new GoalNotFoundError(input.goalId));
    }
    if (goal.workspaceId !== input.workspaceId) {
      return Result.fail(new TaskGoalError("the goal belongs to another workspace"));
    }
    if (goal.status === "COMPLETED" || goal.status === "CANCELLED") {
      return Result.fail(
        new TaskGoalError(`the goal is ${goal.status.toLowerCase()}`),
      );
    }

    const assignee = await this.resolveAssignee(input);
    if (assignee.isFailure) {
      return Result.fail(assignee.error);
    }

    const task = Task.create({
      workspaceId: input.workspaceId,
      goalId: input.goalId,
      ...(input.repositoryId !== undefined && { repositoryId: input.repositoryId }),
      title: input.title,
      ...(input.description !== undefined && { description: input.description }),
      acceptanceCriteria: input.acceptanceCriteria,
      assignee: assignee.value,
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.estimatedCost !== undefined && { estimatedCost: input.estimatedCost }),
      ...(input.estimatedDurationMinutes !== undefined && {
        estimatedDurationMinutes: input.estimatedDurationMinutes,
      }),
      now: this.clock.now(),
    });
    if (task.isFailure) {
      return Result.fail(task.error);
    }

    await this.tasks.save(task.value);
    await flushDomainEvents(task.value, this.publisher);
    return Result.ok({ taskId: task.value.id.value });
  }

  private async resolveAssignee(input: {
    workspaceId: string;
    assigneeType: ActorType;
    assigneeId: string;
  }): Promise<
    Result<
      ActorRef,
      GuardViolation | AssigneeNotInWorkspaceError | AssigneeCannotExecuteError
    >
  > {
    const actor = ActorRef.create(input.assigneeType, input.assigneeId);
    if (actor.isFailure) {
      return actor;
    }
    // Handing work to someone outside the workspace, or to a member whose
    // role cannot execute, would create a task nobody may act on.
    const canExecute = await this.permissions.can(
      { actorType: input.assigneeType, actorId: input.assigneeId },
      "execute_tasks",
      input.workspaceId,
    );
    if (!canExecute) {
      const isMember = await this.permissions.can(
        { actorType: input.assigneeType, actorId: input.assigneeId },
        "read_workspace_state",
        input.workspaceId,
      );
      return Result.fail(
        isMember ? new AssigneeCannotExecuteError() : new AssigneeNotInWorkspaceError(),
      );
    }
    return actor;
  }
}
