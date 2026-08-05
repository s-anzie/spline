import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "./actor";
import { CredentialIssued, CredentialRevoked } from "./identity-events";
import { HumanCredentialNotAllowedError } from "./identity.errors";

interface CredentialProps {
  actor: ActorRef;
  /**
   * §18 — the organization that created this actor, and the only one that may
   * rotate or revoke its credentials. Without it, naming somebody else's
   * actor id would be a cross-organization impersonation route: the scope
   * escalation class, where holding a permission somewhere means minting a
   * credential anywhere.
   */
  organizationId: string;
  /**
   * What an operator calls this actor. It lives here because the credential
   * set IS the registry of non-human actors — v3 has no Agent entity, actors
   * are polymorphic references, and a credential is the only proof one exists.
   */
  displayName: string;
  tokenHash: string;
  createdAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
}

export interface CreateCredentialInput {
  actor: ActorRef;
  organizationId: string;
  displayName: string;
  tokenHash: string;
  now: Date;
}

/**
 * Opaque-token credential for AGENT / WORKER / SERVICE actors. An actor may
 * hold several active credentials at once: rotation is issue-then-revoke,
 * never revoke-then-issue (no auth gap — lesson of the frozen sandbox
 * credentials, v3 §0.3.6).
 */
export class ActorCredential extends AggregateRoot<CredentialProps> {
  static create(
    input: CreateCredentialInput,
    id?: UniqueEntityId,
  ): Result<ActorCredential, GuardViolation | HumanCredentialNotAllowedError> {
    if (input.actor.type === "HUMAN") {
      return Result.fail(new HumanCredentialNotAllowedError());
    }
    const tokenHash = Guard.againstEmpty(input.tokenHash, "tokenHash");
    if (tokenHash.isFailure) {
      return Result.fail(tokenHash.error);
    }
    const organizationId = Guard.againstEmpty(input.organizationId, "organizationId");
    if (organizationId.isFailure) {
      return Result.fail(organizationId.error);
    }
    const displayName = Guard.againstEmpty(input.displayName, "displayName");
    if (displayName.isFailure) {
      return Result.fail(displayName.error);
    }

    const credential = new ActorCredential(
      {
        actor: input.actor,
        organizationId: organizationId.value,
        displayName: displayName.value,
        tokenHash: tokenHash.value,
        createdAt: input.now,
        revokedAt: null,
        lastUsedAt: null,
      },
      id,
    );
    credential.addDomainEvent(
      new CredentialIssued(credential.id.value, input.now, input.actor),
    );
    return Result.ok(credential);
  }

  /** Rebuild from persistence — never raises events. */
  static reconstitute(props: CredentialProps, id: string): ActorCredential {
    return new ActorCredential(props, new UniqueEntityId(id));
  }

  get actor(): ActorRef {
    return this.props.actor;
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get displayName(): string {
    return this.props.displayName;
  }

  /** §18 — the one question every rotation and revocation has to ask first. */
  belongsTo(organizationId: string): boolean {
    return this.props.organizationId === organizationId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }

  get lastUsedAt(): Date | null {
    return this.props.lastUsedAt;
  }

  get isRevoked(): boolean {
    return this.props.revokedAt !== null;
  }

  /** Idempotent: keeps the first revocation time, raises the event once. */
  revoke(now: Date): void {
    if (this.props.revokedAt !== null) {
      return;
    }
    this.props.revokedAt = now;
    this.addDomainEvent(new CredentialRevoked(this.id.value, now, this.props.actor));
  }

  touch(now: Date): void {
    this.props.lastUsedAt = now;
  }
}
