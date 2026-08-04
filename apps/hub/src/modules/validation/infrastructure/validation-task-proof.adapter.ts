import { Inject, Injectable } from "@nestjs/common";

import { ActorType } from "../../identity/domain/actor";
import { TaskProofPort } from "../../task/domain/ports/task-proof.port";
import { RequestValidationUseCase } from "../application/request-validation.use-case";
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
    if (input.types.length === 0) {
      return;
    }
    await this.request.execute({
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      requestedByType: input.requestedByType as ActorType,
      requestedById: input.requestedById,
      validations: input.types.map((type) => ({ type })),
    });
  }
}
