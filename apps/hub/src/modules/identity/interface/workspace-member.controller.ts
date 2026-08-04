import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { ChangeMembershipRoleUseCase } from "../application/change-membership-role.use-case";
import { InviteWorkspaceMemberUseCase } from "../application/invite-workspace-member.use-case";
import { RevokeWorkspaceMembershipUseCase } from "../application/revoke-workspace-membership.use-case";
import {
  USER_REPOSITORY,
  UserRepository,
  WORKSPACE_MEMBERSHIP_REPOSITORY,
  WorkspaceMembershipRepository,
} from "../domain/ports/identity.repository.ports";
import { ActorAuthGuard } from "./actor-auth.guard";
import { ChangeMemberRoleDto, InviteMemberDto } from "./dto/membership.dtos";
import { PermissionsGuard, RequirePermission } from "./permissions.guard";

interface MemberView {
  membershipId: string;
  actorType: string;
  actorId: string;
  role: string;
  /** Only resolvable for humans — other actor types are named by their module. */
  displayName: string | null;
  email: string | null;
  joinedAt: string;
}

/**
 * Membership administration — without these routes a workspace could never
 * hold anyone but its creator.
 */
@Controller("workspaces/:workspaceId/members")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class WorkspaceMemberController {
  constructor(
    private readonly invite: InviteWorkspaceMemberUseCase,
    private readonly changeRole: ChangeMembershipRoleUseCase,
    private readonly revoke: RevokeWorkspaceMembershipUseCase,
    @Inject(WORKSPACE_MEMBERSHIP_REPOSITORY)
    private readonly memberships: WorkspaceMembershipRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  @Post()
  @RequirePermission("manage_members")
  async inviteMember(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: InviteMemberDto,
  ): Promise<{ membershipId: string }> {
    const result = await this.invite.execute({ workspaceId, ...dto });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        conflicts: ["MembershipAlreadyExistsError"],
      });
    }
    return result.value;
  }

  @Get()
  @RequirePermission("read_workspace_state")
  async list(@Param("workspaceId") workspaceId: string): Promise<MemberView[]> {
    const memberships = await this.memberships.listByWorkspace(workspaceId);
    return Promise.all(
      memberships.map(async (membership) => {
        const user =
          membership.actor.type === "HUMAN"
            ? await this.users.findById(membership.actor.actorId)
            : null;
        return {
          membershipId: membership.id.value,
          actorType: membership.actor.type,
          actorId: membership.actor.actorId,
          role: membership.role,
          displayName: user?.displayName ?? null,
          email: user?.email.value ?? null,
          joinedAt: membership.createdAt.toISOString(),
        };
      }),
    );
  }

  @Patch(":membershipId")
  @RequirePermission("manage_members")
  async setRole(
    @Param("workspaceId") workspaceId: string,
    @Param("membershipId") membershipId: string,
    @Body() dto: ChangeMemberRoleDto,
  ): Promise<{ ok: true }> {
    const result = await this.changeRole.execute({ workspaceId, membershipId, role: dto.role });
    if (result.isFailure) {
      // Losing the last owner would leave the workspace unadministrable.
      throw toHttpException(result.error, { conflicts: ["CannotRemoveLastOwnerError"] });
    }
    return { ok: true };
  }

  @Delete(":membershipId")
  @HttpCode(200)
  @RequirePermission("manage_members")
  async remove(
    @Param("workspaceId") workspaceId: string,
    @Param("membershipId") membershipId: string,
  ): Promise<{ ok: true }> {
    const result = await this.revoke.execute({ workspaceId, membershipId });
    if (result.isFailure) {
      // Both refusals are state conflicts, not malformed requests: the caller
      // must settle something first, then retry the very same call.
      throw toHttpException(result.error, {
        conflicts: ["CannotRemoveLastOwnerError", "ActorStillOwnsWorkError"],
      });
    }
    return { ok: true };
  }
}
