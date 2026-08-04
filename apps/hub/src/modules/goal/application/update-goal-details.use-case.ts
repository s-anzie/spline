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
import { UpdateGoalDetailsError } from "../domain/goal";
import { GoalNotFoundError } from "../domain/goal.errors";
import { GOAL_REPOSITORY, GoalRepository } from "../domain/ports/goal.repository.port";

export interface UpdateGoalDetailsInput {
  goalId: string;
  /**
   * Mandatory (§4.2): isolation must not be opt-in. While this was optional,
   * a caller that omitted it silently reached every workspace — which is what
   * happened on three routes.
   */
  workspaceId: string;
  title?: string;
  description?: string;
  successCriteria?: readonly string[];
  priority?: Priority;
}

export type UpdateGoalDetailsUseCaseError = GoalNotFoundError | UpdateGoalDetailsError;

@Injectable()
export class UpdateGoalDetailsUseCase
  implements UseCase<UpdateGoalDetailsInput, Result<void, UpdateGoalDetailsUseCaseError>>
{
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: UpdateGoalDetailsInput,
  ): Promise<Result<void, UpdateGoalDetailsUseCaseError>> {
    const goal = await this.goals.findById(input.goalId);
    if (!goal || goal.workspaceId !== input.workspaceId) {
      return Result.fail(new GoalNotFoundError(input.goalId));
    }

    const updated = goal.updateDetails(
      {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.successCriteria !== undefined && {
          successCriteria: input.successCriteria,
        }),
        ...(input.priority !== undefined && { priority: input.priority }),
      },
      this.clock.now(),
    );
    if (updated.isFailure) {
      return Result.fail(updated.error);
    }

    await this.goals.save(goal);
    await flushDomainEvents(goal, this.publisher);
    return Result.ok(undefined);
  }
}
