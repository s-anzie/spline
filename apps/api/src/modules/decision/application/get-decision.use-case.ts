import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Decision } from "../domain/decision";
import { DECISION_REPOSITORY, DecisionRepository } from "../domain/ports/decision.repository.port";
import { DecisionNotFoundError } from "./decision-application.errors";

@Injectable()
export class GetDecisionUseCase {
  constructor(@Inject(DECISION_REPOSITORY) private readonly decisions: DecisionRepository) {}

  async execute(decisionId: string): Promise<Result<Decision, DecisionNotFoundError>> {
    const decision = await this.decisions.findById(UniqueEntityId.create(decisionId));
    if (!decision) {
      return Result.fail(new DecisionNotFoundError(decisionId));
    }
    return Result.ok(decision);
  }
}
