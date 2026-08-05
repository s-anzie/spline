import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { Permission } from "../domain/permission-matrix";
import { PermissionsService } from "../application/permissions.service";
import { AuthenticatedRequest } from "./current-actor.decorator";

export const REQUIRED_PERMISSION_KEY = "identity/required-permission";
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);

/**
 * Closed, named registry of bootstrap operations (§18.8): the only routes
 * allowed to skip the resource-belongs-to-workspace check — never the
 * authentication or permission checks. Adding an entry here is a review
 * decision, visible in one place.
 */
export const BOOTSTRAP_OPERATIONS = [
  "workspace-create",
  "machine-link",
  "first-member-invite",
] as const;
export type BootstrapOperationName = (typeof BOOTSTRAP_OPERATIONS)[number];

export const BOOTSTRAP_OPERATION_KEY = "identity/bootstrap-operation";
export const BootstrapOperation = (name: BootstrapOperationName) =>
  SetMetadata(BOOTSTRAP_OPERATION_KEY, name);

interface RequestWithParams extends AuthenticatedRequest {
  params: Record<string, string | undefined>;
}

/**
 * RBAC enforcement (§18.3): requires an authenticated actor (attached by
 * ActorAuthGuard), resolves the workspace from :workspaceId, and asks the
 * PermissionsService. Routes without @RequirePermission pass through.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithParams>();
    if (!request.actor) {
      throw new UnauthorizedException("Authentication is required");
    }
    const workspaceId = request.params["workspaceId"];
    if (!workspaceId) {
      throw new ForbiddenException("A workspace scope is required for this action");
    }

    /**
     * §18.10 — the intersection, and the one place it happens.
     *
     * A task grant RESTRICTS what its holder may do; it never widens it. The
     * role is still asked below, so a grant carrying a scope the role lost
     * since it was minted is refused by the role — and a role that would
     * allow something the grant does not carry is refused here.
     *
     * OpenClaw shipped a token path that skipped this (CVE-2026-32922, 9.9):
     * a caller holding a pairing scope could mint an admin one. The check
     * costs two lines and lives where every request passes.
     */
    const grant = request.grant;
    if (grant) {
      if (grant.workspaceId !== workspaceId) {
        throw new ForbiddenException(
          "This grant belongs to another workspace (§18.10)",
        );
      }
      if (!grant.scopes.includes(permission)) {
        throw new ForbiddenException(
          `This grant does not carry "${permission}". It carries: ${grant.scopes.join(", ")}`,
        );
      }
    }

    const allowed = await this.permissions.can(request.actor, permission, workspaceId);
    if (!allowed) {
      throw new ForbiddenException(`Missing permission: ${permission}`);
    }
    return true;
  }
}
