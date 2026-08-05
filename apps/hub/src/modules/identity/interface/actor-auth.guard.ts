import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import {
  TOKEN_SIGNER,
  TokenSigner,
} from "../domain/ports/identity.service.ports";
import { VerifyActorTokenUseCase } from "../application/verify-actor-token.use-case";
import {
  isGrantToken,
  VerifyTaskGrantUseCase,
} from "../application/task-grant.use-cases";
import { AuthenticatedRequest } from "./current-actor.decorator";

interface RequestWithHeaders extends AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Single authentication guard for every actor type (§18.2): a Bearer value
 * is either a human JWT or an opaque actor token (prefix agent_/worker_/
 * service_ — unambiguous by format). On success the actor identity is
 * attached to the request; 401 otherwise.
 */
@Injectable()
export class ActorAuthGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_SIGNER) private readonly signer: TokenSigner,
    private readonly verifyActorToken: VerifyActorTokenUseCase,
    private readonly verifyTaskGrant: VerifyTaskGrantUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const header = request.headers["authorization"];
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }
    const token = raw.slice("Bearer ".length).trim();

    /**
     * §18.2, §18.10 — a task grant, which is not an actor credential and must
     * never be mistaken for one: an actor credential is a lasting identity,
     * a grant is one hour of one job. Checked FIRST, because the prefixes are
     * disjoint and reading them in the other order would be a coincidence
     * rather than a rule.
     */
    if (isGrantToken(token)) {
      const verified = await this.verifyTaskGrant.execute({ token });
      if (verified.isFailure) {
        throw new UnauthorizedException("Invalid task grant");
      }
      request.actor = {
        actorType: verified.value.actor.type,
        actorId: verified.value.actor.actorId,
      };
      // The leash. `PermissionsGuard` intersects with it.
      request.grant = {
        workspaceId: verified.value.workspaceId,
        taskId: verified.value.taskId,
        scopes: verified.value.scopes,
      };
      return true;
    }

    const opaque = /^(agent|worker|service)_/.test(token);
    if (opaque) {
      const verified = await this.verifyActorToken.execute({ token });
      if (verified.isFailure) {
        throw new UnauthorizedException("Invalid actor token");
      }
      request.actor = {
        actorType: verified.value.actor.type,
        actorId: verified.value.actor.actorId,
      };
      return true;
    }

    const payload = await this.signer.verify(token);
    if (!payload) {
      throw new UnauthorizedException("Invalid access token");
    }
    request.actor = { actorType: "HUMAN", actorId: payload.sub };
    return true;
  }
}
