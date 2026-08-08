import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Priority } from "../../../kernel/domain/priority";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../../workspace/domain/ports/workspace.repository.port";
import {
  WorkspaceNotActiveError,
  WorkspaceNotFoundError,
} from "../../workspace/domain/workspace.errors";
import { CreateGoalError, Goal } from "../domain/goal";
import {
  GoalHierarchyError,
  GoalNotFoundError,
} from "../domain/goal.errors";
import { GOAL_REPOSITORY, GoalRepository } from "../domain/ports/goal.repository.port";

export interface CreateGoalInput {
  workspaceId: string;
  parentGoalId?: string;
  sourceTaskId?: string;
  title: string;
  description?: string;
  successCriteria: readonly string[];
  priority?: Priority;
  ownerType: ActorType;
  ownerId: string;
}

export interface CreateGoalOutput {
  goalId: string;
}

export type CreateGoalUseCaseError =
  | CreateGoalError
  | WorkspaceNotFoundError
  | WorkspaceNotActiveError
  | GoalNotFoundError
  | GoalHierarchyError;

@Injectable()
export class CreateGoalUseCase
  implements UseCase<CreateGoalInput, Result<CreateGoalOutput, CreateGoalUseCaseError>>
{
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: CreateGoalInput,
  ): Promise<Result<CreateGoalOutput, CreateGoalUseCaseError>> {
    const workspace = await this.workspaces.findById(input.workspaceId);
    if (!workspace || workspace.status === "DELETED") {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }
    if (workspace.status !== "ACTIVE") {
      return Result.fail(new WorkspaceNotActiveError(workspace.status));
    }

    if (input.parentGoalId !== undefined) {
      const parent = await this.goals.findById(input.parentGoalId);
      if (!parent) {
        return Result.fail(new GoalNotFoundError(input.parentGoalId));
      }
      if (parent.workspaceId !== input.workspaceId) {
        return Result.fail(
          new GoalHierarchyError("the parent goal belongs to another workspace"),
        );
      }
      if (parent.status === "COMPLETED" || parent.status === "CANCELLED") {
        return Result.fail(
          new GoalHierarchyError(`the parent goal is ${parent.status.toLowerCase()}`),
        );
      }
    }

    const owner = ActorRef.create(input.ownerType, input.ownerId);
    if (owner.isFailure) {
      return Result.fail(owner.error);
    }
    const goal = Goal.create({
      workspaceId: input.workspaceId,
      ...(input.parentGoalId !== undefined && { parentGoalId: input.parentGoalId }),
      ...(input.sourceTaskId !== undefined && { sourceTaskId: input.sourceTaskId }),
      title: input.title,
      ...(input.description !== undefined && { description: input.description }),
      successCriteria: input.successCriteria,
      ...(input.priority !== undefined && { priority: input.priority }),
      owner: owner.value,
      now: this.clock.now(),
    });
    if (goal.isFailure) {
      return Result.fail(goal.error);
    }

    await this.goals.save(goal.value);
    await flushDomainEvents(goal.value, this.publisher);
    return Result.ok({ goalId: goal.value.id.value });
  }
}
