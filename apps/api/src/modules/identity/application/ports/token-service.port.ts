export const TOKEN_SERVICE = Symbol("TOKEN_SERVICE");

export type AuthTokenSubjectKind = "user" | "agent";

export interface AuthTokenClaims {
  sub: string;
  kind: AuthTokenSubjectKind;
}

export interface TokenService {
  sign(claims: AuthTokenClaims): string;
  verify(token: string): AuthTokenClaims;
}
