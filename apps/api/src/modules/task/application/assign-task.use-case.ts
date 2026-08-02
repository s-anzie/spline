import { ActorType } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { AgentNotEligibleError } from "../../agent/application/agent-application.errors";
import { GetAgentUseCase } from "../../agent/application/get-agent.use-case";
import { TASK_REPOSITORY, TaskRepository } from "../domain/ports/task.repository.port";
import { Task } from "../domain/task";
import { TaskNotFoundError } from "./task-application.errors";

export interface AssignTaskInput {
  taskId: string;
  assigneeType: ActorType;
  assigneeId: string;
  updatedByType: ActorType;
  updatedById: string;
}

export type AssignTaskError = TaskNotFoundError | AgentNotEligibleError;

@Injectable()
export class AssignTaskUseCase {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    private readonly getAgent: GetAgentUseCase,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: AssignTaskInput): Promise<Result<Task, AssignTaskError>> {
    const task = await this.tasks.findById(UniqueEntityId.create(input.taskId));
    if (!task) {
      return Result.fail(new TaskNotFoundError(input.taskId));
    }

    if (input.assigneeType === ActorType.AGENT) {
      const agentResult = await this.getAgent.execute(input.assigneeId);
      if (agentResult.isSuccess && agentResult.value.isDisabled) {
        return Result.fail(new AgentNotEligibleError(input.assigneeId));
      }
    }

    task.assign(input.assigneeType, input.assigneeId, {
      type: input.updatedByType,
      id: input.updatedById,
    });

    await this.tasks.save(task);
    this.eventPublisher.publishAll(task.domainEvents);
    task.clearEvents();

    return Result.ok(task);
  }
}
