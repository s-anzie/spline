import { DomainError } from "../../../kernel/domain/domain-error";

export class GoalNotFoundError extends DomainError {
  constructor(goalId: string) {
    super("GOAL_NOT_FOUND", `Goal "${goalId}" was not found`);
  }
}

export class DependencyGoalNotFoundError extends DomainError {
  constructor(dependencyGoalIds: string[]) {
    super(
      "DEPENDENCY_GOAL_NOT_FOUND",
      `Dependency goal(s) not found in this workspace: ${dependencyGoalIds.join(", ")}`,
    );
  }
}

export class CircularGoalDependencyError extends DomainError {
  constructor(goalId: string) {
    super(
      "CIRCULAR_GOAL_DEPENDENCY",
      `Setting these dependencies on goal "${goalId}" would create a dependency cycle`,
    );
  }
}
