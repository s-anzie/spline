import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

import { RequestWithRequester } from "./authenticated-requester";
import { RequesterResolver } from "./requester-resolver";

function extractBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedException("Missing bearer token");
  }
  return authorizationHeader.slice("Bearer ".length);
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly requesterResolver: RequesterResolver) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithRequester>();
    const token = extractBearerToken(request.headers.authorization);

    const requester = await this.requesterResolver.resolve(token);
    if (!requester) {
      throw new UnauthorizedException("Invalid or expired token");
    }

    request.requester = requester;
    return true;
  }
}
