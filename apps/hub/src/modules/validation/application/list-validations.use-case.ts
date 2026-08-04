import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { Validation } from "../domain/validation";
import { ValidationNotFoundError } from "../domain/validation.errors";
import {
  ListValidationsFilter,
  VALIDATION_REPOSITORY,
  ValidationRepository,
} from "../domain/ports/validation.repository.port";

/** The proof record of one workspace — never of several (§4.2). */
@Injectable()
export class ListValidationsUseCase
  implements UseCase<ListValidationsFilter, Result<Validation[], GuardViolation>>
{
  constructor(
    @Inject(VALIDATION_REPOSITORY)
    private readonly validations: ValidationRepository,
  ) {}

  async execute(
    filter: ListValidationsFilter,
  ): Promise<Result<Validation[], GuardViolation>> {
    const workspaceId = Guard.againstEmpty(filter.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    return Result.ok(
      await this.validations.list({ ...filter, workspaceId: workspaceId.value }),
    );
  }
}

/**
 * §17.8 in practice: `MissingProofError` names the validations a task still
 * needs, and a caller told "unit_test (v-1) is missing" must be able to fetch
 * v-1. An identifier the API hands out and cannot resolve is a dead end.
 */
@Injectable()
export class GetValidationUseCase
  implements
    UseCase<
      { workspaceId: string; validationId: string },
      Result<Validation, ValidationNotFoundError>
    >
{
  constructor(
    @Inject(VALIDATION_REPOSITORY)
    private readonly validations: ValidationRepository,
  ) {}

  async execute(input: {
    workspaceId: string;
    validationId: string;
  }): Promise<Result<Validation, ValidationNotFoundError>> {
    const validation = await this.validations.findById(input.validationId);
    if (!validation || validation.workspaceId !== input.workspaceId) {
      return Result.fail(new ValidationNotFoundError(input.validationId));
    }
    return Result.ok(validation);
  }
}
