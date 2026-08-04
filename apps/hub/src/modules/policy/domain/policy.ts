import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";

/**
 * §12.2 — the inheritance chain, written most general first. REPOSITORY is
 * conditional: a task without one skips straight from WORKSPACE to GOAL, and
 * the spec is explicit that this "is never an error state, it is the normal
 * case for any work outside the software domain".
 */
export const POLICY_SCOPES = [
  "ORGANIZATION",
  "WORKSPACE",
  "REPOSITORY",
  "GOAL",
  "TASK",
] as const;
export type PolicyScopeType = (typeof POLICY_SCOPES)[number];

/** §12.3 */
export const POLICY_TYPES = [
  "SECURITY",
  "RUNTIME",
  "GIT",
  "VALIDATION",
  "COST",
  "EXTENSION",
] as const;
export type PolicyType = (typeof POLICY_TYPES)[number];

export class PolicySet extends BaseDomainEvent {
  readonly eventName = "policy.set";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly scopeType: PolicyScopeType,
    readonly scopeId: string,
    readonly rule: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class PolicyDisabled extends BaseDomainEvent {
  readonly eventName = "policy.disabled";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly rule: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

interface PolicyProps {
  workspaceId: string;
  scopeType: PolicyScopeType;
  scopeId: string;
  type: PolicyType;
  rule: string;
  value: unknown;
  enabled: boolean;
  createdBy: ActorRef;
  createdAt: Date;
  updatedAt: Date;
}

export interface SetPolicyProps {
  workspaceId: string;
  scopeType: PolicyScopeType;
  scopeId: string;
  type: PolicyType;
  /** Free string like a validation type: §12.3 lists examples, not a closed set. */
  rule: string;
  value: unknown;
  createdBy: ActorRef;
  now: Date;
}

/** A declarative rule of the workspace, which agents cannot bypass (§12). */
export class Policy extends AggregateRoot<PolicyProps> {
  static set(input: SetPolicyProps, id?: UniqueEntityId): Result<Policy, GuardViolation> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    const scopeId = Guard.againstEmpty(input.scopeId, "scopeId");
    if (scopeId.isFailure) {
      return Result.fail(scopeId.error);
    }
    const rule = Guard.againstEmpty(input.rule, "rule");
    if (rule.isFailure) {
      return Result.fail(rule.error);
    }

    const policy = new Policy(
      {
        workspaceId: workspaceId.value,
        scopeType: input.scopeType,
        scopeId: scopeId.value,
        type: input.type,
        rule: rule.value,
        value: input.value,
        enabled: true,
        createdBy: input.createdBy,
        createdAt: input.now,
        updatedAt: input.now,
      },
      id,
    );
    policy.addDomainEvent(
      new PolicySet(
        policy.id.value,
        input.now,
        workspaceId.value,
        input.scopeType,
        scopeId.value,
        rule.value,
      ),
    );
    return Result.ok(policy);
  }

  static reconstitute(props: PolicyProps, id: string): Policy {
    return new Policy(props, new UniqueEntityId(id));
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get scopeType(): PolicyScopeType {
    return this.props.scopeType;
  }

  get scopeId(): string {
    return this.props.scopeId;
  }

  get type(): PolicyType {
    return this.props.type;
  }

  get rule(): string {
    return this.props.rule;
  }

  get value(): unknown {
    return this.props.value;
  }

  get enabled(): boolean {
    return this.props.enabled;
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

  /** Replacing the value of an existing rule at the same scope. */
  changeValue(value: unknown, now: Date): void {
    this.props.value = value;
    this.props.enabled = true;
    this.props.updatedAt = now;
    this.addDomainEvent(
      new PolicySet(
        this.id.value,
        now,
        this.props.workspaceId,
        this.props.scopeType,
        this.props.scopeId,
        this.props.rule,
      ),
    );
  }

  /**
   * Out of the resolution, still on record. §18.7 forbids deletion without
   * audit, and a rule that governed past decisions has to stay readable to
   * explain them — same reasoning as invalidating a Validation rather than
   * rewriting it (§11.8). Idempotent.
   */
  disable(now: Date): void {
    if (!this.props.enabled) {
      return;
    }
    this.props.enabled = false;
    this.props.updatedAt = now;
    this.addDomainEvent(
      new PolicyDisabled(this.id.value, now, this.props.workspaceId, this.props.rule),
    );
  }
}
