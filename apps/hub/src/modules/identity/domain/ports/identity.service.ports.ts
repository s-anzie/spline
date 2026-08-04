import { ActorType } from "../actor";

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
}
export const PASSWORD_HASHER = "identity/PasswordHasher";

export interface HumanTokenPayload {
  sub: string;
  actorType: Extract<ActorType, "HUMAN">;
}

export interface TokenSigner {
  sign(payload: HumanTokenPayload): Promise<string>;
  verify(token: string): Promise<HumanTokenPayload | null>;
}
export const TOKEN_SIGNER = "identity/TokenSigner";

/** Cryptographically strong random secret for opaque actor tokens. */
export interface SecretGenerator {
  generate(): string;
}
export const SECRET_GENERATOR = "identity/SecretGenerator";
