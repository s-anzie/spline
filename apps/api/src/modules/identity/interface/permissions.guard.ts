import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { PermissionsService } from "../application/permissions.service";
import { Permission } from "../domain/permission";
import { RequestWithRequester } from "./authenticated-requester";
import { PERMISSION_METADATA_KEY } from "./require-permission.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.get<Permission | undefined>(
      PERMISSION_METADATA_KEY,
      context.getHandler(),
    );
    if (!permission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithRequester>();
    if (!request.requester) {
      throw new UnauthorizedException("No authenticated requester");
    }

    const workspaceId = request.params.workspaceId;
    if (typeof workspaceId !== "string" || workspaceId.length === 0) {
      throw new Error("PermissionsGuard requires a :workspaceId route param");
    }

    const allowed = await this.permissionsService.can(
      request.requester.type,
      request.requester.id,
      workspaceId,
      permission,
    );
    if (!allowed) {
      throw new ForbiddenException(`Missing permission "${permission}"`);
    }

    return true;
  }
}
