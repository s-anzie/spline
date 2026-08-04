import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { DomainError } from "../../../kernel/domain/domain-error";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { isExpired } from "../../../kernel/domain/staleness";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";

export class ProviderQuotaError extends DomainError {}

/** Above any workspace: a provider's quota is an account-wide resource. */
export class ProviderUnavailable extends BaseDomainEvent {
  readonly eventName = "runtime.provider_unavailable";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly provider: string,
    readonly reason: string,
    readonly until: Date | null,
  ) {
    super(aggregateId, occurredAt, null);
  }
}

export class ProviderRestored extends BaseDomainEvent {
  readonly eventName = "runtime.provider_restored";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly provider: string,
  ) {
    super(aggregateId, occurredAt, null);
  }
}

interface ProviderProps {
  provider: string;
  capabilities: string[];
  /** Set manually by an operator (§4.14). */
  available: boolean;
  quotaUnavailableUntil: Date | null;
  quotaReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterProviderProps {
  provider: string;
  capabilities?: readonly string[];
  now: Date;
}

/**
 * §4.14 — a GLOBAL catalogue, never scoped to a workspace.
 *
 * "Le quota et la disponibilité d'un provider sont une ressource de compte,
 * partagée par construction entre tous les agents qui utilisent la même
 * connexion sous-jacente — les modéliser par agent créerait une fausse
 * impression d'isolement que le fournisseur ne respecte pas réellement"
 * (0.3.7). This is the one entity here with no `workspaceId`, and the absence
 * is the point: workspace isolation protects a workspace's data, it cannot
 * manufacture a quota the provider does not separate.
 */
export class ProviderProfile extends AggregateRoot<ProviderProps> {
  static register(
    input: RegisterProviderProps,
    id?: UniqueEntityId,
  ): Result<ProviderProfile, GuardViolation> {
    const provider = Guard.againstEmpty(input.provider, "provider");
    if (provider.isFailure) {
      return Result.fail(provider.error);
    }
    return Result.ok(
      new ProviderProfile(
        {
          provider: provider.value,
          capabilities: [...(input.capabilities ?? [])],
          available: true,
          quotaUnavailableUntil: null,
          quotaReason: null,
          createdAt: input.now,
          updatedAt: input.now,
        },
        id,
      ),
    );
  }

  static reconstitute(props: ProviderProps, id: string): ProviderProfile {
    return new ProviderProfile(props, new UniqueEntityId(id));
  }

  get provider(): string {
    return this.props.provider;
  }

  get capabilities(): readonly string[] {
    return [...this.props.capabilities];
  }

  get available(): boolean {
    return this.props.available;
  }

  get quotaUnavailableUntil(): Date | null {
    return this.props.quotaUnavailableUntil;
  }

  get quotaReason(): string | null {
    return this.props.quotaReason;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /**
   * §4.14 — "propriété calculée, jamais un champ stocké séparément":
   *
   *   available AND (quota_unavailable_until IS NULL OR < now)
   *
   * A derived field that is stored is a field that eventually lies.
   */
  isAvailableAt(now: Date): boolean {
    if (!this.props.available) {
      return false;
    }
    return (
      this.props.quotaUnavailableUntil === null ||
      isExpired(this.props.quotaUnavailableUntil, now)
    );
  }

  /**
   * An observation, with its evidence and its window. Refused without a
   * reason: an unexplained lockout leaves an operator nothing to act on, and
   * §17.8 is about exactly that.
   */
  markQuotaExhausted(
    until: Date,
    reason: string,
    now: Date,
  ): Result<void, GuardViolation | ProviderQuotaError> {
    const explained = Guard.againstEmpty(reason, "reason");
    if (explained.isFailure) {
      return Result.fail(explained.error);
    }
    if (isExpired(until, now)) {
      return Result.fail(
        new ProviderQuotaError(
          "a quota window that has already passed would lock nothing",
        ),
      );
    }
    this.props.quotaUnavailableUntil = until;
    this.props.quotaReason = explained.value;
    this.props.updatedAt = now;
    this.addDomainEvent(
      new ProviderUnavailable(
        this.id.value,
        now,
        this.props.provider,
        explained.value,
        until,
      ),
    );
    return Result.ok(undefined);
  }

  /**
   * §4.14 (0.3.9), the bug this method exists to make impossible: restoring
   * without clearing the quota window "est silencieusement un no-op tant que
   * la fenêtre de quota n'a pas naturellement expiré". The three fields that
   * decide availability move together, in one named act — never through three
   * setters a caller could leave out of step.
   */
  restore(by: ActorRef, now: Date): void {
    this.props.available = true;
    this.props.quotaUnavailableUntil = null;
    this.props.quotaReason = null;
    this.props.updatedAt = now;
    void by;
    this.addDomainEvent(
      new ProviderRestored(this.id.value, now, this.props.provider),
    );
  }

  /**
   * The other half, and it is deliberately NOT symmetric: §4.14 says a manual
   * disabling "ne doit jamais fabriquer une quota_reason qu'elle n'a pas
   * constatée". Someone switching a provider off has observed nothing about
   * quota, and writing one would put an invented fact in the record.
   */
  disable(by: ActorRef, now: Date): void {
    this.props.available = false;
    this.props.updatedAt = now;
    void by;
    this.addDomainEvent(
      new ProviderUnavailable(
        this.id.value,
        now,
        this.props.provider,
        "switched off by an operator",
        null,
      ),
    );
  }
}
