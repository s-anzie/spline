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
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import {
  TaskDependencyError,
  TaskNotEditableError,
  TaskNotFoundError,
} from "../domain/task.errors";

export interface ManageTaskDependencyInput {
  taskId: string;
  dependsOnTaskId: string;
  operation: "add" | "remove";
  /**
   * Mandatory (§4.2): isolation must not be opt-in. While this was optional,
   * a caller that omitted it silently reached every workspace — which is what
   * happened on three routes.
   */
  workspaceId: string;
}

export type ManageTaskDependencyError =
  | TaskNotFoundError
  | TaskDependencyError
  | TaskNotEditableError;

/** Cycles are rejected at write time through the kernel DependencyGraph (§9.5). */
@Injectable()
export class ManageTaskDependencyUseCase
  implements UseCase<ManageTaskDependencyInput, Result<void, ManageTaskDependencyError>>
{
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: ManageTaskDependencyInput,
  ): Promise<Result<void, ManageTaskDependencyError>> {
    const task = await this.tasks.findById(input.taskId);
    if (!task || (input.workspaceId && task.workspaceId !== input.workspaceId)) {
      return Result.fail(new TaskNotFoundError(input.taskId));
    }

    if (input.operation === "remove") {
      const removed = task.removeDependency(input.dependsOnTaskId, this.clock.now());
      if (removed.isFailure) {
        return Result.fail(removed.error);
      }
      await this.tasks.save(task);
      await flushDomainEvents(task, this.publisher);
      return Result.ok(undefined);
    }

    const target = await this.tasks.findById(input.dependsOnTaskId);
    if (!target) {
      return Result.fail(new TaskNotFoundError(input.dependsOnTaskId));
    }
    if (target.workspaceId !== task.workspaceId) {
      return Result.fail(
        new TaskDependencyError("a task cannot depend on a task from another workspace"),
      );
    }

    const graph = new DependencyGraph();
    for (const sibling of await this.tasks.list({ workspaceId: task.workspaceId })) {
      graph.addNode(sibling.id.value);
      for (const dependency of sibling.dependsOnTaskIds) {
        graph.addDependency(sibling.id.value, dependency);
      }
    }
    if (graph.addDependency(input.taskId, input.dependsOnTaskId).isFailure) {
      return Result.fail(new TaskDependencyError("it would create a cycle between tasks"));
    }

    const added = task.addDependency(input.dependsOnTaskId, this.clock.now());
    if (added.isFailure) {
      return Result.fail(added.error);
    }

    await this.tasks.save(task);
    await flushDomainEvents(task, this.publisher);
    return Result.ok(undefined);
  }
}
