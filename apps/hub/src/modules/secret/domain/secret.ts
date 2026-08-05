import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";

/**
 * A name a process can carry as an environment variable. Constrained because
 * it becomes one: a name with a `=` or a newline in it would let whoever
 * chose it inject a second variable.
 */
const NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

export class SecretStored extends BaseDomainEvent {
  readonly eventName = "secret.stored";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly name: string,
    readonly rotated: boolean,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

/**
 * §18.7 lists "Secret Access" among the audited actions. The FACT is raised
 * here; the audit trail listens. It carries who and which — never the value,
 * because an audit entry is the one record designed to be kept forever.
 */
export class SecretAccessed extends BaseDomainEvent {
  readonly eventName = "secret.accessed";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly name: string,
    readonly by: ActorRef,
    readonly reason: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

interface SecretProps {
  workspaceId: string;
  name: string;
  /** Opaque here. Only the cipher knows what is inside (§18.4). */
  sealed: string;
  createdBy: ActorRef;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt: Date | null;
}

export interface StoreSecretProps {
  workspaceId: string;
  name: string;
  sealed: string;
  createdBy: ActorRef;
  now: Date;
}

/**
 * §18.4 — a secret a task may be given.
 *
 * The value is never in this object as plaintext, never in an event, never in
 * a read model, and never in a log. What this aggregate holds is a sealed
 * string it cannot itself open — which is why the domain can be read without
 * anyone worrying about what it prints.
 */
export class Secret extends AggregateRoot<SecretProps> {
  static store(
    input: StoreSecretProps,
    id?: UniqueEntityId,
  ): Result<Secret, GuardViolation> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    if (!NAME_PATTERN.test(input.name)) {
      return Result.fail(
        new GuardViolation(
          "name",
          "must look like an environment variable: A-Z, digits and underscores, starting with a letter",
        ),
      );
    }
    const sealed = Guard.againstEmpty(input.sealed, "sealed");
    if (sealed.isFailure) {
      return Result.fail(sealed.error);
    }

    const secret = new Secret(
      {
        workspaceId: workspaceId.value,
        name: input.name,
        sealed: sealed.value,
        createdBy: input.createdBy,
        createdAt: input.now,
        updatedAt: input.now,
        lastAccessedAt: null,
      },
      id,
    );
    secret.addDomainEvent(
      new SecretStored(secret.id.value, input.now, workspaceId.value, input.name, false),
    );
    return Result.ok(secret);
  }

  static reconstitute(props: SecretProps, id: string): Secret {
    return new Secret(props, new UniqueEntityId(id));
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get name(): string {
    return this.props.name;
  }

  get sealed(): string {
    return this.props.sealed;
  }

  get createdBy(): ActorRef {
    return this.props.createdBy;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get lastAccessedAt(): Date | null {
    return this.props.lastAccessedAt;
  }

  /**
   * Rotation is issue-then-replace on the same name, so a task that resolves
   * this secret between the two never finds nothing (§0.3.6's lesson, one
   * level down).
   */
  rotate(sealed: string, now: Date): Result<void, GuardViolation> {
    const guarded = Guard.againstEmpty(sealed, "sealed");
    if (guarded.isFailure) {
      return Result.fail(guarded.error);
    }
    this.props.sealed = guarded.value;
    this.props.updatedAt = now;
    this.addDomainEvent(
      new SecretStored(this.id.value, now, this.props.workspaceId, this.props.name, true),
    );
    return Result.ok(undefined);
  }

  /** §18.7 — reading a secret is an act, and acts are recorded. */
  noteAccess(by: ActorRef, reason: string, now: Date): void {
    this.props.lastAccessedAt = now;
    this.addDomainEvent(
      new SecretAccessed(
        this.id.value,
        now,
        this.props.workspaceId,
        this.props.name,
        by,
        reason,
      ),
    );
  }
}
