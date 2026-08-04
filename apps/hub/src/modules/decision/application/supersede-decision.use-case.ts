import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import {
  DecisionAlreadySupersededError,
  DecisionNotFoundError,
  DecisionSupersessionError,
} from "../domain/decision.errors";
import {
  DECISION_REPOSITORY,
  DecisionRepository,
} from "../domain/ports/decision.repository.port";
import {
  RecordDecisionError,
  RecordDecisionInput,
  RecordDecisionOutput,
  RecordDecisionUseCase,
} from "./record-decision.use-case";

export interface SupersedeDecisionInput extends RecordDecisionInput {
  /** The decision this new reasoning replaces. */
  decisionId: string;
}

export type SupersedeDecisionError =
  | DecisionNotFoundError
  | DecisionAlreadySupersededError
  | DecisionSupersessionError
  | RecordDecisionError;

/**
 * Recording the replacement and marking the old one is a single gesture: two
 * separate calls would leave a window where no decision is the current one,
 * and §16.10 rebuilds memory from exactly this chain.
 */
@Injectable()
export class SupersedeDecisionUseCase
  implements
    UseCase<SupersedeDecisionInput, Result<RecordDecisionOutput, SupersedeDecisionError>>
{
  constructor(
    @Inject(DECISION_REPOSITORY) private readonly decisions: DecisionRepository,
    private readonly recordDecision: RecordDecisionUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: SupersedeDecisionInput,
  ): Promise<Result<RecordDecisionOutput, SupersedeDecisionError>> {
    const { decisionId, ...replacement } = input;

    // Check the target first: refusing after writing would leave an orphan
    // replacement nobody asked for.
    const superseded = await this.decisions.findById(decisionId);
    if (!superseded || superseded.workspaceId !== input.workspaceId) {
      return Result.fail(new DecisionNotFoundError(decisionId));
    }
    if (superseded.isSuperseded) {
      return Result.fail(
        new DecisionAlreadySupersededError(superseded.supersededByDecisionId as string),
      );
    }

    const recorded = await this.recordDecision.execute(replacement);
    if (recorded.isFailure) {
      return Result.fail(recorded.error);
    }

    const marked = superseded.supersede(recorded.value.decisionId, this.clock.now());
    if (marked.isFailure) {
      return Result.fail(marked.error);
    }
    await this.decisions.save(superseded);
    await flushDomainEvents(superseded, this.publisher);

    return Result.ok(recorded.value);
  }
}
