import { Inject, Injectable } from "@nestjs/common";

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
  MembershipNotFoundError,
} from "../domain/identity.errors";
import {
  WORKSPACE_MEMBERSHIP_REPOSITORY,
  WorkspaceMembershipRepository,
} from "../domain/ports/identity.repository.ports";

export interface RevokeMembershipInput {
  membershipId: string;
}

export type RevokeMembershipError = MembershipNotFoundError | CannotRemoveLastOwnerError;

@Injectable()
export class RevokeWorkspaceMembershipUseCase
  implements UseCase<RevokeMembershipInput, Result<void, RevokeMembershipError>>
{
  constructor(
    @Inject(WORKSPACE_MEMBERSHIP_REPOSITORY)
    private readonly memberships: WorkspaceMembershipRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: RevokeMembershipInput,
  ): Promise<Result<void, RevokeMembershipError>> {
    const membership = await this.memberships.findById(input.membershipId);
    if (!membership) {
      return Result.fail(new MembershipNotFoundError(input.membershipId));
    }
    if (membership.role === "OWNER") {
      const owners = await this.memberships.countByWorkspaceAndRole(
        membership.workspaceId,
        "OWNER",
      );
      if (owners <= 1) {
        return Result.fail(new CannotRemoveLastOwnerError(membership.workspaceId));
      }
    }

    membership.revoke(this.clock.now());
    await this.memberships.delete(membership.id.value);
    flushDomainEvents(membership, this.publisher);
    return Result.ok(undefined);
  }
}
