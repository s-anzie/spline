import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { GoalStatus } from "../domain/goal";
import {
  CompletionRequiresApprovalError,
  GoalNotFoundError,
  UnsatisfiedDependenciesError,
} from "../domain/goal.errors";
import { GOAL_REPOSITORY, GoalRepository } from "../domain/ports/goal.repository.port";

export interface ChangeGoalStatusInput {
  goalId: string;
  /**
   * Mandatory (§4.2): isolation must not be opt-in. While this was optional,
   * a caller that omitted it silently reached every workspace — which is what
   * happened on three routes.
   */
  workspaceId: string;
  status: GoalStatus;
}

export type ChangeGoalStatusError =
  | GoalNotFoundError
  | InvalidStateTransitionError
  | CompletionRequiresApprovalError
  | UnsatisfiedDependenciesError;

@Injectable()
export class ChangeGoalStatusUseCase
  implements UseCase<ChangeGoalStatusInput, Result<void, ChangeGoalStatusError>>
{
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: ChangeGoalStatusInput,
  ): Promise<Result<void, ChangeGoalStatusError>> {
    const goal = await this.goals.findById(input.goalId);
    if (!goal || (input.workspaceId && goal.workspaceId !== input.workspaceId)) {
      return Result.fail(new GoalNotFoundError(input.goalId));
    }

    // §9.5 analogue: a goal becomes workable only once its dependencies are
    // satisfied. CANCELLED dependencies never will be — they don't block.
    if (input.status === "ACTIVE" && goal.dependsOnGoalIds.length > 0) {
      const pending: string[] = [];
      for (const dependencyId of goal.dependsOnGoalIds) {
        const dependency = await this.goals.findById(dependencyId);
        if (
          dependency &&
          dependency.status !== "COMPLETED" &&
          dependency.status !== "CANCELLED"
        ) {
          pending.push(dependencyId);
        }
      }
      if (pending.length > 0) {
        return Result.fail(new UnsatisfiedDependenciesError(pending));
      }
    }

    const changed = goal.changeStatus(input.status, this.clock.now());
    if (changed.isFailure) {
      return Result.fail(changed.error);
    }

    await this.goals.save(goal);
    flushDomainEvents(goal, this.publisher);
    return Result.ok(undefined);
  }
}
