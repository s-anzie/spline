import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";

import {
  HumanTokenPayload,
  PasswordHasher,
  SecretGenerator,
  TokenSigner,
} from "../domain/ports/identity.service.ports";

const BCRYPT_ROUNDS = 10;

@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return hash(plain, BCRYPT_ROUNDS);
  }

  async compare(plain: string, hashed: string): Promise<boolean> {
    return compare(plain, hashed);
  }
}

@Injectable()
export class JwtTokenSigner implements TokenSigner {
  constructor(private readonly jwt: JwtService) {}

  async sign(payload: HumanTokenPayload): Promise<string> {
    return this.jwt.signAsync({ sub: payload.sub, actorType: payload.actorType });
  }

  async verify(token: string): Promise<HumanTokenPayload | null> {
    try {
      const decoded = await this.jwt.verifyAsync<{ sub: string; actorType: string }>(
        token,
      );
      if (decoded.actorType !== "HUMAN" || !decoded.sub) {
        return null;
      }
      return { sub: decoded.sub, actorType: "HUMAN" };
    } catch {
      return null;
    }
  }
}

@Injectable()
export class CryptoSecretGenerator implements SecretGenerator {
  generate(): string {
    return randomBytes(32).toString("base64url");
  }
}
