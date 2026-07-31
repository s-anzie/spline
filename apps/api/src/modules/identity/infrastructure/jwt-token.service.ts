import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { AuthTokenClaims, TokenService } from "../application/ports/token-service.port";

@Injectable()
export class JwtTokenService implements TokenService {
  constructor(private readonly jwtService: JwtService) {}

  sign(claims: AuthTokenClaims): string {
    return this.jwtService.sign(claims);
  }

  verify(token: string): AuthTokenClaims {
    return this.jwtService.verify<AuthTokenClaims>(token);
  }
}
