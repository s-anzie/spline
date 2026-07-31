import { AuthTokenClaims, TokenService } from "../ports/token-service.port";

export class FakeTokenService implements TokenService {
  sign(claims: AuthTokenClaims): string {
    return JSON.stringify(claims);
  }

  verify(token: string): AuthTokenClaims {
    return JSON.parse(token) as AuthTokenClaims;
  }
}
