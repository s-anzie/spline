import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { DependencyGraph } from "../../../kernel/domain/dependency-graph";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import {
  GoalDependencyError,
  GoalNotEditableError,
  GoalNotFoundError,
} from "../domain/goal.errors";
import { GOAL_REPOSITORY, GoalRepository } from "../domain/ports/goal.repository.port";

export interface ManageGoalDependencyInput {
  goalId: string;
  dependsOnGoalId: string;
  operation: "add" | "remove";
  workspaceId?: string;
}

export type ManageGoalDependencyError =
  | GoalNotFoundError
  | GoalDependencyError
  | GoalNotEditableError;

/**
 * §5.6 dependencies. Cycles are rejected at write time through the kernel
 * DependencyGraph (§9.5) — an invalid graph is never persisted and then
 * discovered later during scheduling.
 */
@Injectable()
export class ManageGoalDependencyUseCase
  implements UseCase<ManageGoalDependencyInput, Result<void, ManageGoalDependencyError>>
{
  constructor(
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: ManageGoalDependencyInput,
  ): Promise<Result<void, ManageGoalDependencyError>> {
    const goal = await this.goals.findById(input.goalId);
    if (!goal || (input.workspaceId && goal.workspaceId !== input.workspaceId)) {
      return Result.fail(new GoalNotFoundError(input.goalId));
    }

    if (input.operation === "remove") {
      const removed = goal.removeDependency(input.dependsOnGoalId, this.clock.now());
      if (removed.isFailure) {
        return Result.fail(removed.error);
      }
      await this.goals.save(goal);
      flushDomainEvents(goal, this.publisher);
      return Result.ok(undefined);
    }

    const target = await this.goals.findById(input.dependsOnGoalId);
    if (!target) {
      return Result.fail(new GoalNotFoundError(input.dependsOnGoalId));
    }
    if (target.workspaceId !== goal.workspaceId) {
      return Result.fail(
        new GoalDependencyError("a goal cannot depend on a goal from another workspace"),
      );
    }

    const cycleCheck = await this.rejectCycle(goal.workspaceId, input);
    if (cycleCheck.isFailure) {
      return Result.fail(cycleCheck.error);
    }

    const added = goal.addDependency(input.dependsOnGoalId, this.clock.now());
    if (added.isFailure) {
      return Result.fail(added.error);
    }

    await this.goals.save(goal);
    flushDomainEvents(goal, this.publisher);
    return Result.ok(undefined);
  }

  /** Replays the workspace graph, then lets DependencyGraph judge the new edge. */
  private async rejectCycle(
    workspaceId: string,
    input: ManageGoalDependencyInput,
  ): Promise<Result<void, GoalDependencyError>> {
    const graph = new DependencyGraph();
    for (const sibling of await this.goals.list({ workspaceId })) {
      graph.addNode(sibling.id.value);
      for (const dependency of sibling.dependsOnGoalIds) {
        graph.addDependency(sibling.id.value, dependency);
      }
    }

    const added = graph.addDependency(input.goalId, input.dependsOnGoalId);
    if (added.isFailure) {
      return Result.fail(
        new GoalDependencyError("it would create a cycle between goals"),
      );
    }
    return Result.ok(undefined);
  }
}
