import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

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
      if (result.error.name === "UserNotFoundError") {
        throw new NotFoundException(result.error.message);
      }
      if (result.error.name === "MembershipAlreadyExistsError") {
        throw new ConflictException(result.error.message);
      }
      throw new BadRequestException(result.error.message);
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
    @Param("membershipId") membershipId: string,
    @Body() dto: ChangeMemberRoleDto,
  ): Promise<{ ok: true }> {
    const result = await this.changeRole.execute({ membershipId, role: dto.role });
    if (result.isFailure) {
      if (result.error.name === "MembershipNotFoundError") {
        throw new NotFoundException(result.error.message);
      }
      // Losing the last owner would leave the workspace unadministrable.
      if (result.error.name === "CannotRemoveLastOwnerError") {
        throw new ConflictException(result.error.message);
      }
      throw new BadRequestException(result.error.message);
    }
    return { ok: true };
  }

  @Delete(":membershipId")
  @HttpCode(200)
  @RequirePermission("manage_members")
  async remove(@Param("membershipId") membershipId: string): Promise<{ ok: true }> {
    const result = await this.revoke.execute({ membershipId });
    if (result.isFailure) {
      if (result.error.name === "MembershipNotFoundError") {
        throw new NotFoundException(result.error.message);
      }
      // Both refusals are state conflicts, not malformed requests: the caller
      // must settle something first, then retry the very same call.
      if (
        result.error.name === "CannotRemoveLastOwnerError" ||
        result.error.name === "ActorStillOwnsWorkError"
      ) {
        throw new ConflictException(result.error.message);
      }
      throw new BadRequestException(result.error.message);
    }
    return { ok: true };
  }
}
