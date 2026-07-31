import { PasswordHasher } from "../ports/password-hasher.port";

/** Deterministic, fast stand-in for bcrypt in unit tests — never used outside tests. */
export class FakePasswordHasher implements PasswordHasher {
  async hash(plainText: string): Promise<string> {
    return `hashed:${plainText}`;
  }

  async compare(plainText: string, hash: string): Promise<boolean> {
    return hash === `hashed:${plainText}`;
  }
}
