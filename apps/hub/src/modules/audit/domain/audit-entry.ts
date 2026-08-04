import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";

export interface AuditEntryProps {
  /**
   * Nullable like a DomainEvent's: an organisation-level change belongs to no
   * single workspace, and forcing one would be a lie (§4.20's reasoning).
   */
  workspaceId: string | null;
  actor: ActorRef;
  action: string;
  targetType: string;
  targetId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  /** Not in §4.23, but the signature chain needs a total order — see Event. */
  sequence: bigint;
  signature: string;
  createdAt: Date;
}

export interface RecordAuditProps {
  workspaceId: string | null;
  actor: ActorRef;
  /** Free string: §18.7 lists actions, the Runtime and Registry will add more. */
  action: string;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  now: Date;
}

/**
 * §4.23 — "toute action importante génère une entrée d'audit. L'audit est
 * immuable." Strictly immutable here: no mutator, not even a disable, unlike
 * a Policy. What it records is `before`/`after`, which is the single thing an
 * Event cannot carry (a fact describes what is, not what was).
 */
export class AuditEntry extends AggregateRoot<AuditEntryProps> {
  static record(
    input: RecordAuditProps,
    id?: UniqueEntityId,
  ): Result<AuditEntry, GuardViolation> {
    const action = Guard.againstEmpty(input.action, "action");
    if (action.isFailure) {
      return Result.fail(action.error);
    }
    const targetType = Guard.againstEmpty(input.targetType, "targetType");
    if (targetType.isFailure) {
      return Result.fail(targetType.error);
    }
    const targetId = Guard.againstEmpty(input.targetId, "targetId");
    if (targetId.isFailure) {
      return Result.fail(targetId.error);
    }

    return Result.ok(
      new AuditEntry(
        {
          workspaceId: input.workspaceId,
          actor: input.actor,
          action: action.value,
          targetType: targetType.value,
          targetId: targetId.value,
          // A creation has no before, a deletion has no after. Both are real.
          before: input.before ?? null,
          after: input.after ?? null,
          sequence: 0n,
          signature: "",
          createdAt: input.now,
        },
        id,
      ),
    );
  }

  static reconstitute(props: AuditEntryProps, id: string): AuditEntry {
    return new AuditEntry(props, new UniqueEntityId(id));
  }

  get workspaceId(): string | null {
    return this.props.workspaceId;
  }

  get actor(): ActorRef {
    return this.props.actor;
  }

  get action(): string {
    return this.props.action;
  }

  get targetType(): string {
    return this.props.targetType;
  }

  get targetId(): string {
    return this.props.targetId;
  }

  get before(): Record<string, unknown> | null {
    return this.props.before;
  }

  get after(): Record<string, unknown> | null {
    return this.props.after;
  }

  get sequence(): bigint {
    return this.props.sequence;
  }

  get signature(): string {
    return this.props.signature;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** A copy of the props, for signing and for rebuilding a signed entry. */
  snapshot(): AuditEntryProps {
    return { ...this.props };
  }
}
