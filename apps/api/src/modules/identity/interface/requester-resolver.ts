import { ActorType } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { AGENT_TOKEN_PREFIX } from "../application/agent-token-format";
import { TOKEN_SERVICE, TokenService } from "../application/ports/token-service.port";
import { VerifyAgentTokenUseCase } from "../application/verify-agent-token.use-case";
import { AuthenticatedRequester } from "./authenticated-requester";

/**
 * Resolves a bearer token (human JWT or agent_-prefixed credential) into an
 * AuthenticatedRequester. Shared by JwtAuthGuard (HTTP) and RealtimeGateway
 * (WebSocket handshake) so both transports authenticate identically.
 */
@Injectable()
export class RequesterResolver {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    private readonly verifyAgentToken: VerifyAgentTokenUseCase,
  ) {}

  async resolve(token: string): Promise<AuthenticatedRequester | null> {
    if (token.startsWith(AGENT_TOKEN_PREFIX)) {
      const credential = await this.verifyAgentToken.execute(token);
      return credential ? { type: ActorType.AGENT, id: credential.agentId } : null;
    }

    try {
      const claims = this.tokenService.verify(token);
      return { type: ActorType.HUMAN, id: claims.sub };
    } catch {
      return null;
    }
  }
}
