import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";

import { PasswordHasher } from "../application/ports/password-hasher.port";

const SALT_ROUNDS = 12;

@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  async hash(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, SALT_ROUNDS);
  }

  async compare(plainText: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainText, hash);
  }
}
