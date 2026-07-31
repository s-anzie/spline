import { Inject, Injectable } from "@nestjs/common";

import { Decision } from "../domain/decision";
import { DECISION_REPOSITORY, DecisionRepository } from "../domain/ports/decision.repository.port";

@Injectable()
export class ListDecisionsByWorkspaceUseCase {
  constructor(@Inject(DECISION_REPOSITORY) private readonly decisions: DecisionRepository) {}

  async execute(workspaceId: string): Promise<Decision[]> {
    return this.decisions.listByWorkspace(workspaceId);
  }
}
