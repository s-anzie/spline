import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { Validation } from "../domain/validation";
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
