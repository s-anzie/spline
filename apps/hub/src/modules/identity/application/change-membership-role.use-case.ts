import { Inject, Injectable } from "@nestjs/common";

import { AUDIT_TRAIL, AuditTrail } from "../../../kernel/domain/ports/audit-trail.port";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import {
  CannotRemoveLastOwnerError,
  IncompatibleRoleError,
  MembershipNotFoundError,
} from "../domain/identity.errors";
import { WorkspaceRole } from "../domain/permission-matrix";
import {
  WORKSPACE_MEMBERSHIP_REPOSITORY,
  WorkspaceMembershipRepository,
} from "../domain/ports/identity.repository.ports";

export interface ChangeMembershipRoleInput {
  workspaceId: string;
  membershipId: string;
  role: WorkspaceRole;
}

export type ChangeMembershipRoleError =
  | MembershipNotFoundError
  | IncompatibleRoleError
  | CannotRemoveLastOwnerError;

@Injectable()
export class ChangeMembershipRoleUseCase
  implements
    UseCase<ChangeMembershipRoleInput, Result<void, ChangeMembershipRoleError>>
{
  constructor(
    @Inject(WORKSPACE_MEMBERSHIP_REPOSITORY)
    private readonly memberships: WorkspaceMembershipRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
  ) {}

  async execute(
    input: ChangeMembershipRoleInput,
  ): Promise<Result<void, ChangeMembershipRoleError>> {
    const membership = await this.memberships.findById(input.membershipId);
    // Reachable from any workspace before this check: the guard proved the
    // caller owns the workspace in the URL, never that the membership is in
    // it. It was refused only when the target happened to be the last owner
    // of the other workspace — an accident, not isolation (§4.2).
    if (!membership || membership.workspaceId !== input.workspaceId) {
      return Result.fail(new MembershipNotFoundError(input.membershipId));
    }

    const demotesAnOwner = membership.role === "OWNER" && input.role !== "OWNER";
    if (demotesAnOwner) {
      const owners = await this.memberships.countByWorkspaceAndRole(
        membership.workspaceId,
        "OWNER",
      );
      if (owners <= 1) {
        return Result.fail(new CannotRemoveLastOwnerError(membership.workspaceId));
      }
    }

    // Captured before the mutation: this is the whole reason an audit entry
    // cannot be derived from an Event afterwards.
    const previousRole = membership.role;
    const changed = membership.changeRole(input.role, this.clock.now());
    if (changed.isFailure) {
      return Result.fail(changed.error);
    }

    await this.memberships.save(membership);
    await flushDomainEvents(membership, this.publisher);
    // §18.7 lists "Permission Change" among what must be audited, and an
    // Event cannot stand in for it: it does not carry the previous role.
    await this.audit.record({
      workspaceId: membership.workspaceId,
      actor: membership.actor,
      action: "permission.role_changed",
      targetType: "membership",
      targetId: membership.id.value,
      before: { role: previousRole },
      after: { role: input.role },
    });
    return Result.ok(undefined);
  }
}
