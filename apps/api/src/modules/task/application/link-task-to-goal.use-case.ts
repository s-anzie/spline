import { ActorType } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { GetGoalUseCase } from "../../goal/application/get-goal.use-case";
import { GoalNotFoundError } from "../../goal/application/goal-application.errors";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { Task } from "../domain/task";
import { EmptyTaskGoalIdError } from "../domain/task.errors";
import { GoalProgressSyncService } from "./goal-progress-sync.service";
import { GoalNotInWorkspaceError, TaskNotFoundError } from "./task-application.errors";

export interface LinkTaskToGoalInput {
  taskId: string;
  goalId: string;
  updatedByType: ActorType;
  updatedById: string;
}

export type LinkTaskToGoalError =
  | TaskNotFoundError
  | GoalNotFoundError
  | GoalNotInWorkspaceError
  | EmptyTaskGoalIdError;

/** Fixes an orphan task (or re-links one) — re-syncs BOTH the old and new goal's progress, since Task doesn't know Goal exists. */
@Injectable()
export class LinkTaskToGoalUseCase {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    private readonly getGoal: GetGoalUseCase,
    private readonly goalProgressSync: GoalProgressSyncService,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: LinkTaskToGoalInput): Promise<Result<Task, LinkTaskToGoalError>> {
    const task = await this.tasks.findById(UniqueEntityId.create(input.taskId));
    if (!task) {
      return Result.fail(new TaskNotFoundError(input.taskId));
    }

    const goalResult = await this.getGoal.execute(input.goalId);
    if (goalResult.isFailure) {
      return Result.fail(goalResult.error);
    }
    if (goalResult.value.workspaceId !== task.workspaceId) {
      return Result.fail(new GoalNotInWorkspaceError(input.goalId, task.workspaceId));
    }

    const previousGoalId = task.goalId;
    try {
      task.linkToGoal(input.goalId, { type: input.updatedByType, id: input.updatedById });
    } catch (error) {
      if (error instanceof EmptyTaskGoalIdError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.tasks.save(task);
    if (previousGoalId && previousGoalId !== input.goalId) {
      await this.goalProgressSync.syncIfNeeded(previousGoalId);
    }
    await this.goalProgressSync.syncIfNeeded(input.goalId);

    this.eventPublisher.publishAll(task.domainEvents);
    task.clearEvents();

    return Result.ok(task);
  }
}
