import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { comparePriority } from "../../../kernel/domain/priority";
import { Result } from "../../../kernel/domain/result";
import { Goal, GoalStatus } from "../domain/goal";
import { GOAL_REPOSITORY, GoalRepository } from "../domain/ports/goal.repository.port";

export interface ListGoalsInput {
  workspaceId: string;
  /** `null` selects root goals only; omitted means "every goal". */
  parentGoalId?: string | null;
  statuses?: readonly GoalStatus[];
}

@Injectable()
export class ListGoalsUseCase implements UseCase<ListGoalsInput, Result<Goal[], never>> {
  constructor(@Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository) {}

  async execute(input: ListGoalsInput): Promise<Result<Goal[], never>> {
    const goals = await this.goals.list(input);
    // Most urgent first, then oldest first — a stable order humans can scan.
    const sorted = [...goals].sort(
      (a, b) =>
        comparePriority(a.priority, b.priority) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
    return Result.ok(sorted);
  }
}
