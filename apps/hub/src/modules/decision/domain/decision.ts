import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";
import { ConsideredAlternative } from "./considered-alternative";
import { DecisionRecorded, DecisionSuperseded } from "./decision-events";
import {
  DecisionAlreadySupersededError,
  DecisionSupersessionError,
} from "./decision.errors";

/**
 * A coarse scale on purpose: nobody honestly distinguishes 62% from 67%
 * confidence in a design choice, and false precision would invite filtering
 * on noise.
 */
export const DECISION_CONFIDENCES = ["LOW", "MEDIUM", "HIGH"] as const;
export type DecisionConfidence = (typeof DECISION_CONFIDENCES)[number];

interface DecisionProps {
  workspaceId: string;
  taskId: string | null;
  subject: string;
  rationale: string;
  alternatives: ConsideredAlternative[];
  outcome: string;
  confidence: DecisionConfidence;
  author: ActorRef;
  supersededByDecisionId: string | null;
  decidedAt: Date;
}

export interface RecordDecisionProps {
  workspaceId: string;
  taskId?: string;
  subject: string;
  rationale: string;
  alternatives?: readonly ConsideredAlternative[];
  outcome: string;
  confidence?: DecisionConfidence;
  author: ActorRef;
  now: Date;
}

function normalizeAlternatives(
  alternatives: readonly ConsideredAlternative[],
): ConsideredAlternative[] {
  return alternatives
    .map((alternative) => ({
      option: alternative.option.trim(),
      rejectedBecause: alternative.rejectedBecause.trim(),
    }))
    .filter((alternative) => alternative.option && alternative.rejectedBecause);
}

/**
 * Why something was done, not what was done. Immutable by construction: §16.10
 * rebuilds memory from decisions, so editing one would mean reading today's
 * reasoning while believing you read yesterday's. A decision is superseded,
 * never rewritten — which is also why this aggregate has no state machine.
 */
export class Decision extends AggregateRoot<DecisionProps> {
  static record(
    input: RecordDecisionProps,
    id?: UniqueEntityId,
  ): Result<Decision, GuardViolation> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    const subject = Guard.againstEmpty(input.subject, "subject");
    const rationale = Guard.againstEmpty(input.rationale, "rationale");
    const outcome = Guard.againstEmpty(input.outcome, "outcome");
    const guards = Result.combine([workspaceId, subject, rationale, outcome]);
    if (guards.isFailure) {
      return Result.fail(guards.error);
    }

    const decision = new Decision(
      {
        workspaceId: workspaceId.value,
        taskId: input.taskId ?? null,
        subject: subject.value,
        rationale: rationale.value,
        alternatives: normalizeAlternatives(input.alternatives ?? []),
        outcome: outcome.value,
        confidence: input.confidence ?? "MEDIUM",
        author: input.author,
        supersededByDecisionId: null,
        decidedAt: input.now,
      },
      id,
    );
    decision.addDomainEvent(
      new DecisionRecorded(
        decision.id.value,
        input.now,
        workspaceId.value,
        decision.taskId,
      ),
    );
    return Result.ok(decision);
  }

  /** Rebuild from persistence — never raises events. */
  static reconstitute(props: DecisionProps, id: string): Decision {
    return new Decision(props, new UniqueEntityId(id));
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get taskId(): string | null {
    return this.props.taskId;
  }

  get subject(): string {
    return this.props.subject;
  }

  get rationale(): string {
    return this.props.rationale;
  }

  get alternatives(): readonly ConsideredAlternative[] {
    return [...this.props.alternatives];
  }

  get outcome(): string {
    return this.props.outcome;
  }

  get confidence(): DecisionConfidence {
    return this.props.confidence;
  }

  get author(): ActorRef {
    return this.props.author;
  }

  get supersededByDecisionId(): string | null {
    return this.props.supersededByDecisionId;
  }

  get isSuperseded(): boolean {
    return this.props.supersededByDecisionId !== null;
  }

  get decidedAt(): Date {
    return this.props.decidedAt;
  }

  /** The only mutation this aggregate allows. */
  supersede(
    byDecisionId: string,
    now: Date,
  ): Result<void, GuardViolation | DecisionSupersessionError | DecisionAlreadySupersededError> {
    const replacement = Guard.againstEmpty(byDecisionId, "supersededByDecisionId");
    if (replacement.isFailure) {
      return Result.fail(replacement.error);
    }
    if (replacement.value === this.id.value) {
      return Result.fail(
        new DecisionSupersessionError("a decision cannot supersede itself"),
      );
    }
    if (this.props.supersededByDecisionId === replacement.value) {
      return Result.ok(undefined);
    }
    if (this.props.supersededByDecisionId !== null) {
      return Result.fail(
        new DecisionAlreadySupersededError(this.props.supersededByDecisionId),
      );
    }

    this.props.supersededByDecisionId = replacement.value;
    this.addDomainEvent(new DecisionSuperseded(
      this.id.value,
      now,
      this.props.workspaceId,
      replacement.value,
    ));
    return Result.ok(undefined);
  }
}
