import { ActorType } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { GOAL_REPOSITORY, GoalRepository } from "../domain/ports/goal.repository.port";
import { Goal } from "../domain/goal";
import { EmptyBlockerReasonError } from "../domain/goal.errors";
import { GoalNotFoundError } from "./goal-application.errors";

export interface ReportGoalBlockerInput {
  goalId: string;
  reason: string;
  reporterType: ActorType;
  reporterId: string;
}

export type ReportGoalBlockerError = GoalNotFoundError | EmptyBlockerReasonError;

@Injectable()
export class ReportGoalBlockerUseCase {
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: ReportGoalBlockerInput): Promise<Result<Goal, ReportGoalBlockerError>> {
    const goal = await this.goals.findById(UniqueEntityId.create(input.goalId));
    if (!goal) {
      return Result.fail(new GoalNotFoundError(input.goalId));
    }

    try {
      goal.reportBlocker(input.reason, input.reporterType, input.reporterId);
    } catch (error) {
      if (error instanceof EmptyBlockerReasonError) {
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
