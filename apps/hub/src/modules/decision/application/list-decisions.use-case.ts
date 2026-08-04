import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { Decision, DecisionConfidence } from "../domain/decision";
import {
  DECISION_REPOSITORY,
  DecisionRepository,
} from "../domain/ports/decision.repository.port";

export interface ListDecisionsInput {
  workspaceId: string;
  taskId?: string;
  authorType?: ActorType;
  authorId?: string;
  confidences?: readonly DecisionConfidence[];
  includeSuperseded?: boolean;
}

@Injectable()
export class ListDecisionsUseCase
  implements UseCase<ListDecisionsInput, Result<Decision[], never>>
{
  constructor(
    @Inject(DECISION_REPOSITORY) private readonly decisions: DecisionRepository,
  ) {}

  async execute(input: ListDecisionsInput): Promise<Result<Decision[], never>> {
    const author =
      input.authorType && input.authorId
        ? ActorRef.create(input.authorType, input.authorId)
        : null;

    const decisions = await this.decisions.list({
      workspaceId: input.workspaceId,
      ...(input.taskId !== undefined && { taskId: input.taskId }),
      ...(input.confidences !== undefined && { confidences: input.confidences }),
      ...(input.includeSuperseded !== undefined && {
        includeSuperseded: input.includeSuperseded,
      }),
      ...(author?.isSuccess && { author: author.value }),
    });
    // Newest first: the current state of the reasoning is what people read.
    return Result.ok(
      [...decisions].sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime()),
    );
  }
}
