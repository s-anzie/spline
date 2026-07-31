import { ActorType } from "@repo/db";

import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { DecisionRecorded } from "./decision-events";
import {
  EmptyDecisionOutcomeError,
  EmptyDecisionSubjectError,
  InvalidDecisionConfidenceError,
} from "./decision.errors";

export interface Actor {
  type: ActorType;
  id: string;
}

export interface DecisionProps {
  workspaceId: string;
  subject: string;
  context?: string;
  optionsConsidered: string[];
  decision: string;
  decidedByType: ActorType;
  decidedById: string;
  decidedAt: Date;
  confidence?: number;
  references: string[];
}

export interface RecordDecisionProps {
  workspaceId: string;
  subject: string;
  context?: string;
  optionsConsidered?: string[];
  decision: string;
  decidedBy: Actor;
  confidence?: number;
  references?: string[];
}

function normalizeRequired(value: string, error: () => never): string {
  const trimmed = value.trim();
  if (!trimmed) {
    error();
  }
  return trimmed;
}

function validateConfidence(confidence: number | undefined): void {
  if (confidence !== undefined && (confidence < 0 || confidence > 1)) {
    throw new InvalidDecisionConfidenceError();
  }
}

/** An immutable trace of a decision already made — no mutation methods, unlike Task/Process/AgentSession. */
export class Decision extends AggregateRoot<DecisionProps> {
  static record(props: RecordDecisionProps, at: Date = new Date(), id?: UniqueEntityId): Decision {
    const subject = normalizeRequired(props.subject, () => {
      throw new EmptyDecisionSubjectError();
    });
    const outcome = normalizeRequired(props.decision, () => {
      throw new EmptyDecisionOutcomeError();
    });
    validateConfidence(props.confidence);

    const decision = new Decision(
      {
        workspaceId: props.workspaceId,
        subject,
        context: props.context,
        optionsConsidered: props.optionsConsidered ?? [],
        decision: outcome,
        decidedByType: props.decidedBy.type,
        decidedById: props.decidedBy.id,
        decidedAt: at,
        confidence: props.confidence,
        references: props.references ?? [],
      },
      id,
    );
    decision.record(
      new DecisionRecorded(
        decision.props.workspaceId,
        decision.id.toString(),
        decision.props.subject,
        decision.props.decidedByType,
        decision.props.decidedById,
      ),
    );
    return decision;
  }

  static reconstitute(props: DecisionProps, id: UniqueEntityId): Decision {
    return new Decision(props, id);
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get subject(): string {
    return this.props.subject;
  }

  get context(): string | undefined {
    return this.props.context;
  }

  get optionsConsidered(): string[] {
    return this.props.optionsConsidered;
  }

  get decision(): string {
    return this.props.decision;
  }

  get decidedByType(): ActorType {
    return this.props.decidedByType;
  }

  get decidedById(): string {
    return this.props.decidedById;
  }

  get decidedAt(): Date {
    return this.props.decidedAt;
  }

  get confidence(): number | undefined {
    return this.props.confidence;
  }

  get references(): string[] {
    return this.props.references;
  }
}
