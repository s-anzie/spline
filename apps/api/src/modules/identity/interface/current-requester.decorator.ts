import { createParamDecorator, ExecutionContext, UnauthorizedException } from "@nestjs/common";

import { AuthenticatedRequester, RequestWithRequester } from "./authenticated-requester";

export function extractRequester(request: RequestWithRequester): AuthenticatedRequester {
  if (!request.requester) {
    throw new UnauthorizedException("No authenticated requester on request");
  }
  return request.requester;
}

export const CurrentRequester = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedRequester => {
    return extractRequester(ctx.switchToHttp().getRequest<RequestWithRequester>());
  },
);
