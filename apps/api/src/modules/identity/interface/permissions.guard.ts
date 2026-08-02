import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { PrismaService } from "../../../prisma/prisma.service";
import { PermissionsService } from "../application/permissions.service";
import { Permission } from "../domain/permission";
import { RequestWithRequester } from "./authenticated-requester";
import { PERMISSION_METADATA_KEY } from "./require-permission.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
    private readonly prisma: PrismaService,
  ) {}

  private async resourceBelongsToWorkspace(
    params: Record<string, unknown>,
    workspaceId: string,
  ): Promise<boolean> {
    const checks: Array<Promise<unknown>> = [];
    const add = (key: string, query: (id: string) => Promise<unknown>) => {
      const id = params[key];
      if (typeof id === "string" && id.length > 0) checks.push(query(id));
    };

    add("goalId", (id) =>
      this.prisma.goal.findFirst({ where: { id, workspaceId }, select: { id: true } }),
    );
    add("taskId", (id) =>
      this.prisma.task.findFirst({ where: { id, workspaceId }, select: { id: true } }),
    );
    add("agentId", (id) =>
      this.prisma.agent.findFirst({ where: { id, workspaceId }, select: { id: true } }),
    );
    add("processId", (id) =>
      this.prisma.process.findFirst({ where: { id, workspaceId }, select: { id: true } }),
    );
    add("sessionId", (id) =>
      this.prisma.agentSession.findFirst({ where: { id, workspaceId }, select: { id: true } }),
    );
    add("lockId", (id) =>
      this.prisma.resourceLock.findFirst({ where: { id, workspaceId }, select: { id: true } }),
    );
    add("artifactId", (id) =>
      this.prisma.artifact.findFirst({ where: { id, workspaceId }, select: { id: true } }),
    );
    add("decisionId", (id) =>
      this.prisma.decision.findFirst({ where: { id, workspaceId }, select: { id: true } }),
    );
    add("eventId", (id) =>
      this.prisma.event.findFirst({ where: { id, workspaceId }, select: { id: true } }),
    );
    add("notificationId", (id) =>
      this.prisma.notification.findFirst({ where: { id, workspaceId }, select: { id: true } }),
    );
    add("questionId", (id) =>
      this.prisma.agentQuestion.findFirst({ where: { id, workspaceId }, select: { id: true } }),
    );
    add("machineId", (id) =>
      this.prisma.localMachine.findFirst({
        where: { id, workspaceIds: { array_contains: workspaceId } },
        select: { id: true },
      }),
    );

    if (checks.length === 0) return true;
    const resources = await Promise.all(checks);
    return resources.every(Boolean);
  }

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

    if (!(await this.resourceBelongsToWorkspace(request.params, workspaceId))) {
      // Deliberately indistinguishable from a missing identifier: callers must
      // never learn whether a resource exists in another workspace.
      throw new NotFoundException("Resource not found in workspace");
    }

    return true;
  }
}
