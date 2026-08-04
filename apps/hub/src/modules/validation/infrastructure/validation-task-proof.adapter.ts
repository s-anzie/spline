import { Inject, Injectable } from "@nestjs/common";

import { ActorType } from "../../identity/domain/actor";
import { TASK_REPOSITORY, TaskRepository } from "../../task/domain/ports/task.repository.port";
import { TaskProofPort } from "../../task/domain/ports/task-proof.port";
import { RequestValidationUseCase } from "../application/request-validation.use-case";
import {
  MANDATED_VALIDATIONS,
  MandatedValidationsPort,
} from "../domain/ports/mandated-validations.port";
import {
  VALIDATION_REPOSITORY,
  ValidationRepository,
} from "../domain/ports/validation.repository.port";

/**
 * Supplies the task module's own abstraction (§DIP): the task owns the rule
 * "never completed without proof" (§4.9), this module knows what proof
 * exists. Nothing in task/ imports validation/.
 */
@Injectable()
export class ValidationTaskProofAdapter implements TaskProofPort {
  constructor(
    @Inject(VALIDATION_REPOSITORY)
    private readonly validations: ValidationRepository,
    private readonly request: RequestValidationUseCase,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(MANDATED_VALIDATIONS) private readonly mandated: MandatedValidationsPort,
  ) {}

  async unsatisfiedMandatory(taskId: string): Promise<{ id: string; type: string }[]> {
    const validations = await this.validations.listByTask(taskId);
    return validations
      .filter((validation) => validation.mandatory && !validation.satisfies())
      .map((validation) => ({ id: validation.id.value, type: validation.type }));
  }

  async requestOnSubmit(input: {
    workspaceId: string;
    taskId: string;
    requestedByType: string;
    requestedById: string;
    types: readonly string[];
  }): Promise<void> {
    // §12.3 — the workspace can require proofs the agent did not ask for.
    // They become ordinary mandatory Validations, so the completion check
    // enforces them while knowing nothing about policies (§11.7).
    const task = await this.tasks.findById(input.taskId);
    const required = await this.mandated.mandatedFor({
      workspaceId: input.workspaceId,
      goalId: task?.goalId,
      taskId: input.taskId,
    });
    const types = [...new Set([...input.types, ...required])];
    if (types.length === 0) {
      return;
    }
    await this.request.execute({
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      requestedByType: input.requestedByType as ActorType,
      requestedById: input.requestedById,
      validations: types.map((type) => ({ type })),
    });
  }
}
