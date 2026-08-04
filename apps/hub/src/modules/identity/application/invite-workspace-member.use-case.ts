import { Injectable } from "@nestjs/common";
import { Inject } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { ActorType } from "../domain/actor";
import { Email } from "../domain/email";
import { InvalidEmailError, UserNotFoundError } from "../domain/identity.errors";
import { WorkspaceRole } from "../domain/permission-matrix";
import {
  USER_REPOSITORY,
  UserRepository,
} from "../domain/ports/identity.repository.ports";
import {
  GrantMembershipError,
  GrantMembershipOutput,
  GrantWorkspaceMembershipUseCase,
} from "./grant-workspace-membership.use-case";

export interface InviteWorkspaceMemberInput {
  workspaceId: string;
  role: WorkspaceRole;
  /** Humans are invited by email — nobody knows their internal id. */
  email?: string;
  /** Non-human actors are referenced explicitly. */
  actorType?: ActorType;
  actorId?: string;
}

export type InviteWorkspaceMemberError =
  | GuardViolation
  | InvalidEmailError
  | UserNotFoundError
  | GrantMembershipError;

/**
 * Onboarding entry point. A human is invited by email because that is the
 * only identifier the inviter actually knows; other actor types are
 * referenced by id since they are registered by their own module.
 */
@Injectable()
export class InviteWorkspaceMemberUseCase
  implements
    UseCase<
      InviteWorkspaceMemberInput,
      Result<GrantMembershipOutput, InviteWorkspaceMemberError>
    >
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly grant: GrantWorkspaceMembershipUseCase,
  ) {}

  async execute(
    input: InviteWorkspaceMemberInput,
  ): Promise<Result<GrantMembershipOutput, InviteWorkspaceMemberError>> {
    if (input.email !== undefined) {
      const email = Email.create(input.email);
      if (email.isFailure) {
        return Result.fail(email.error);
      }
      const user = await this.users.findByEmail(email.value.value);
      if (!user) {
        return Result.fail(new UserNotFoundError(email.value.value));
      }
      return this.grant.execute({
        actorType: "HUMAN",
        actorId: user.id.value,
        workspaceId: input.workspaceId,
        role: input.role,
      });
    }

    if (input.actorType !== undefined && input.actorId !== undefined) {
      return this.grant.execute({
        actorType: input.actorType,
        actorId: input.actorId,
        workspaceId: input.workspaceId,
        role: input.role,
      });
    }

    return Result.fail(
      new GuardViolation("invitee", "requires either an email or an actor reference"),
    );
  }
}
