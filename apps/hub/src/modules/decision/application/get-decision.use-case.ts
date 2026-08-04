import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Result } from "../../../kernel/domain/result";
import { Decision } from "../domain/decision";
import { DecisionNotFoundError } from "../domain/decision.errors";
import {
  DECISION_REPOSITORY,
  DecisionRepository,
} from "../domain/ports/decision.repository.port";

export interface GetDecisionInput {
  decisionId: string;
  /**
   * Mandatory (§4.2): isolation must not be opt-in. While this was optional,
   * a caller that omitted it silently reached every workspace — which is what
   * happened on three routes.
   */
  workspaceId: string;
}

@Injectable()
export class GetDecisionUseCase
  implements UseCase<GetDecisionInput, Result<Decision, DecisionNotFoundError>>
{
  constructor(
    @Inject(DECISION_REPOSITORY) private readonly decisions: DecisionRepository,
  ) {}

  async execute(
    input: GetDecisionInput,
  ): Promise<Result<Decision, DecisionNotFoundError>> {
    const decision = await this.decisions.findById(input.decisionId);
    if (!decision || decision.workspaceId !== input.workspaceId) {
      return Result.fail(new DecisionNotFoundError(input.decisionId));
    }
    return Result.ok(decision);
  }
}
