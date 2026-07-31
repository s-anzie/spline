import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { Actor, Decision } from "../domain/decision";
import {
  EmptyDecisionOutcomeError,
  EmptyDecisionSubjectError,
  InvalidDecisionConfidenceError,
} from "../domain/decision.errors";
import { DECISION_REPOSITORY, DecisionRepository } from "../domain/ports/decision.repository.port";

export interface RecordDecisionInput {
  workspaceId: string;
  subject: string;
  context?: string;
  optionsConsidered?: string[];
  decision: string;
  decidedBy: Actor;
  confidence?: number;
  references?: string[];
}

export type RecordDecisionError =
  | WorkspaceNotFoundError
  | EmptyDecisionSubjectError
  | EmptyDecisionOutcomeError
  | InvalidDecisionConfidenceError;

@Injectable()
export class RecordDecisionUseCase {
  constructor(
    @Inject(DECISION_REPOSITORY) private readonly decisions: DecisionRepository,
    private readonly getWorkspace: GetWorkspaceUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: RecordDecisionInput): Promise<Result<Decision, RecordDecisionError>> {
    const workspaceResult = await this.getWorkspace.execute(input.workspaceId);
    if (workspaceResult.isFailure) {
      return Result.fail(workspaceResult.error);
    }

    let decision: Decision;
    try {
      decision = Decision.record(input, this.clock.now());
    } catch (error) {
      if (
        error instanceof EmptyDecisionSubjectError ||
        error instanceof EmptyDecisionOutcomeError ||
        error instanceof InvalidDecisionConfidenceError
      ) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.decisions.save(decision);
    this.eventPublisher.publishAll(decision.domainEvents);
    decision.clearEvents();

    return Result.ok(decision);
  }
}
