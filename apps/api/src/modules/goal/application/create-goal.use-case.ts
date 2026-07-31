import { ActorType, Priority } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { GOAL_REPOSITORY, GoalRepository } from "../domain/ports/goal.repository.port";
import { Goal } from "../domain/goal";
import { EmptyGoalTitleError } from "../domain/goal.errors";

export interface CreateGoalInput {
  workspaceId: string;
  title: string;
  description?: string;
  priority?: Priority;
  ownerType: ActorType;
  ownerId: string;
  successCriteria?: unknown[];
  startDate?: Date;
  dueDate?: Date;
}

export type CreateGoalError = WorkspaceNotFoundError | EmptyGoalTitleError;

@Injectable()
export class CreateGoalUseCase {
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    private readonly getWorkspace: GetWorkspaceUseCase,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: CreateGoalInput): Promise<Result<Goal, CreateGoalError>> {
    const workspaceResult = await this.getWorkspace.execute(input.workspaceId);
    if (workspaceResult.isFailure) {
      return Result.fail(workspaceResult.error);
    }

    let goal: Goal;
    try {
      goal = Goal.create(input);
    } catch (error) {
      if (error instanceof EmptyGoalTitleError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.goals.save(goal);
    this.eventPublisher.publishAll(goal.domainEvents);
    goal.clearEvents();

    return Result.ok(goal);
  }
}
