import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import { ActorIdentity } from "../application/permissions.service";

export interface AuthenticatedRequest {
  actor?: ActorIdentity;
}

/** Extracts the actor attached by an auth guard. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ActorIdentity | undefined => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.actor;
  },
);
