import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { ValueObject } from "../../../kernel/domain/value-object";

/** The four v3 actor types (§18.2) — every identity in the system is one of these. */
export const ACTOR_TYPES = ["HUMAN", "AGENT", "WORKER", "SERVICE"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

interface ActorRefProps extends Record<string, unknown> {
  type: ActorType;
  id: string;
}

/**
 * Polymorphic actor reference used by memberships, credentials, audit
 * entries and every future owner/created_by field.
 */
export class ActorRef extends ValueObject<ActorRefProps> {
  static create(type: ActorType, id: string): Result<ActorRef, GuardViolation> {
    return Guard.againstEmpty(id, "actorId").map(
      (trimmed) => new ActorRef({ type, id: trimmed }),
    );
  }

  get type(): ActorType {
    return this.props.type;
  }

  get actorId(): string {
    return this.props.id;
  }
}
