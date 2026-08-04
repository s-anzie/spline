import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { DomainEvent } from "../../../kernel/domain/domain-event";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";
import { EventSeverity, payloadOf, severityFor } from "./event-severity";
import { MalformedEventTypeError } from "./event.errors";

interface EventProps {
  workspaceId: string | null;
  type: string;
  severity: EventSeverity;
  actor: ActorRef | null;
  targetType: string;
  targetId: string;
  payload: Record<string, unknown>;
  sequence: bigint;
  createdAt: Date;
}

export interface RecordEventProps {
  workspaceId: string | null;
  type: string;
  severity?: EventSeverity;
  actor?: ActorRef;
  targetType: string;
  targetId: string;
  payload?: Record<string, unknown>;
  sequence?: bigint;
  now: Date;
}

/**
 * A fact that happened (§4.20). Immutable and behaviour-free: there is no
 * mutator at all, not even a supersession — a fact is not revised, another
 * fact is recorded. It also raises no domain event of its own, which would
 * otherwise never end.
 *
 * §4.20's `target` is split into targetType/targetId: a single string would
 * force every reader to re-parse it.
 */
export class Event extends AggregateRoot<EventProps> {
  static record(
    input: RecordEventProps,
    id?: UniqueEntityId,
  ): Result<Event, GuardViolation> {
    const type = Guard.againstEmpty(input.type, "type");
    const targetType = Guard.againstEmpty(input.targetType, "targetType");
    const targetId = Guard.againstEmpty(input.targetId, "targetId");
    const guards = Result.combine([type, targetType, targetId]);
    if (guards.isFailure) {
      return Result.fail(guards.error);
    }

    return Result.ok(
      new Event(
        {
          workspaceId: input.workspaceId,
          type: type.value,
          severity: input.severity ?? severityFor(type.value),
          actor: input.actor ?? null,
          targetType: targetType.value,
          targetId: targetId.value,
          payload: { ...input.payload },
          // 0n means "not yet assigned": the store hands out the real order.
          sequence: input.sequence ?? 0n,
          createdAt: input.now,
        },
        id,
      ),
    );
  }

  /**
   * Projects a domain event into a recordable fact. Nothing is retrofitted
   * onto the thirty-odd event classes: the category comes from the name's
   * prefix and the target from the aggregate id.
   */
  static fromDomainEvent(
    event: DomainEvent,
    sequence: bigint,
    actor?: ActorRef,
  ): Result<Event, GuardViolation | MalformedEventTypeError> {
    const [category] = event.eventName.split(".");
    if (!category || !event.eventName.includes(".")) {
      return Result.fail(new MalformedEventTypeError(event.eventName));
    }

    return Event.record({
      workspaceId: event.workspaceId,
      type: event.eventName,
      targetType: category,
      targetId: event.aggregateId,
      payload: payloadOf(event),
      sequence,
      ...(actor !== undefined && { actor }),
      now: event.occurredAt,
    });
  }

  /** Rebuild from persistence. */
  static reconstitute(props: EventProps, id: string): Event {
    return new Event(props, new UniqueEntityId(id));
  }

  get workspaceId(): string | null {
    return this.props.workspaceId;
  }

  get type(): string {
    return this.props.type;
  }

  get severity(): EventSeverity {
    return this.props.severity;
  }

  get actor(): ActorRef | null {
    return this.props.actor;
  }

  get targetType(): string {
    return this.props.targetType;
  }

  get targetId(): string {
    return this.props.targetId;
  }

  get payload(): Record<string, unknown> {
    return { ...this.props.payload };
  }

  get sequence(): bigint {
    return this.props.sequence;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
