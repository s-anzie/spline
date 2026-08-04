import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../domain/actor";
import {
  IncompatibleRoleError,
  MembershipAlreadyExistsError,
} from "../domain/identity.errors";
import { WorkspaceRole } from "../domain/permission-matrix";
import {
  WORKSPACE_MEMBERSHIP_REPOSITORY,
  WorkspaceMembershipRepository,
} from "../domain/ports/identity.repository.ports";
import { WorkspaceMembership } from "../domain/workspace-membership";

export interface GrantMembershipInput {
  actorType: ActorType;
  actorId: string;
  workspaceId: string;
  role: WorkspaceRole;
}

export interface GrantMembershipOutput {
  membershipId: string;
}

export type GrantMembershipError =
  | GuardViolation
  | IncompatibleRoleError
  | MembershipAlreadyExistsError;

@Injectable()
export class GrantWorkspaceMembershipUseCase
  implements
    UseCase<GrantMembershipInput, Result<GrantMembershipOutput, GrantMembershipError>>
{
  constructor(
    @Inject(WORKSPACE_MEMBERSHIP_REPOSITORY)
    private readonly memberships: WorkspaceMembershipRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: GrantMembershipInput,
  ): Promise<Result<GrantMembershipOutput, GrantMembershipError>> {
    const actor = ActorRef.create(input.actorType, input.actorId);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }
    const existing = await this.memberships.findByActorAndWorkspace(
      actor.value,
      input.workspaceId,
    );
    if (existing) {
      return Result.fail(new MembershipAlreadyExistsError());
    }

    const membership = WorkspaceMembership.create({
      actor: actor.value,
      workspaceId: input.workspaceId,
      role: input.role,
      now: this.clock.now(),
    });
    if (membership.isFailure) {
      return Result.fail(membership.error);
    }

    await this.memberships.save(membership.value);
    await flushDomainEvents(membership.value, this.publisher);
    return Result.ok({ membershipId: membership.value.id.value });
  }
}
