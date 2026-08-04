import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { ActorRef } from "./actor";
import { WorkspaceRole } from "./permission-matrix";

export class UserRegistered extends BaseDomainEvent {
  readonly eventName = "identity.user_registered";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly email: string,
  ) {
    super(aggregateId, occurredAt);
  }
}

export class OrganizationCreated extends BaseDomainEvent {
  readonly eventName = "identity.organization_created";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly ownerId: string,
    readonly slug: string,
  ) {
    super(aggregateId, occurredAt);
  }
}

export class OrganizationRenamed extends BaseDomainEvent {
  readonly eventName = "identity.organization_renamed";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly slug: string,
  ) {
    super(aggregateId, occurredAt);
  }
}

export class MembershipGranted extends BaseDomainEvent {
  readonly eventName = "identity.membership_granted";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly workspaceId: string,
    readonly actor: ActorRef,
    readonly role: WorkspaceRole,
  ) {
    super(aggregateId, occurredAt);
  }
}

export class MembershipRoleChanged extends BaseDomainEvent {
  readonly eventName = "identity.membership_role_changed";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly workspaceId: string,
    readonly previousRole: WorkspaceRole,
    readonly newRole: WorkspaceRole,
  ) {
    super(aggregateId, occurredAt);
  }
}

export class MembershipRevoked extends BaseDomainEvent {
  readonly eventName = "identity.membership_revoked";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly workspaceId: string,
    readonly actor: ActorRef,
  ) {
    super(aggregateId, occurredAt);
  }
}

export class CredentialIssued extends BaseDomainEvent {
  readonly eventName = "identity.credential_issued";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly actor: ActorRef,
  ) {
    super(aggregateId, occurredAt);
  }
}

export class CredentialRevoked extends BaseDomainEvent {
  readonly eventName = "identity.credential_revoked";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly actor: ActorRef,
  ) {
    super(aggregateId, occurredAt);
  }
}
