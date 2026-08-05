import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import { ActorIdentity } from "../application/permissions.service";

/**
 * §18.10 — the leash a task grant puts on a request. Absent for an ordinary
 * credential, which is limited by its role alone.
 */
export interface GrantScope {
  workspaceId: string;
  taskId: string;
  scopes: readonly string[];
}

export interface AuthenticatedRequest {
  grant?: GrantScope;
  actor?: ActorIdentity;
}

/** Extracts the actor attached by an auth guard. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ActorIdentity | undefined => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.actor;
  },
);
