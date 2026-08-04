import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { PermissionsService } from "../../identity/application/permissions.service";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import {
  IncompatibleAssigneeError,
  TaskNotEditableError,
  TaskNotFoundError,
} from "../domain/task.errors";
import {
  AssigneeCannotExecuteError,
  AssigneeNotInWorkspaceError,
} from "./task-application.errors";

export interface AssignTaskInput {
  taskId: string;
  /**
   * Mandatory (§4.2): isolation must not be opt-in. While this was optional,
   * a caller that omitted it silently reached every workspace — which is what
   * happened on three routes.
   */
  workspaceId: string;
  assigneeType: ActorType;
  assigneeId: string;
}

export type AssignTaskError =
  | TaskNotFoundError
  | GuardViolation
  | IncompatibleAssigneeError
  | TaskNotEditableError
  | AssigneeNotInWorkspaceError
  | AssigneeCannotExecuteError;

@Injectable()
export class AssignTaskUseCase
  implements UseCase<AssignTaskInput, Result<void, AssignTaskError>>
{
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    private readonly permissions: PermissionsService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(input: AssignTaskInput): Promise<Result<void, AssignTaskError>> {
    const task = await this.tasks.findById(input.taskId);
    if (!task || (input.workspaceId && task.workspaceId !== input.workspaceId)) {
      return Result.fail(new TaskNotFoundError(input.taskId));
    }

    const actor = ActorRef.create(input.assigneeType, input.assigneeId);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }
    const identity = { actorType: input.assigneeType, actorId: input.assigneeId };
    if (!(await this.permissions.can(identity, "execute_tasks", task.workspaceId))) {
      const isMember = await this.permissions.can(
        identity,
        "read_workspace_state",
        task.workspaceId,
      );
      return Result.fail(
        isMember ? new AssigneeCannotExecuteError() : new AssigneeNotInWorkspaceError(),
      );
    }

    const assigned = task.assignTo(actor.value, this.clock.now());
    if (assigned.isFailure) {
      return Result.fail(assigned.error);
    }

    await this.tasks.save(task);
    await flushDomainEvents(task, this.publisher);
    return Result.ok(undefined);
  }
}
