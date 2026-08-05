import { Result } from "../../../../kernel/domain/result";

/** Raised when a sealed value cannot be opened. Never carries the value. */
export class UnsealableSecretError extends Error {
  readonly name = "UnsealableSecretError";

  constructor(reason: string) {
    super(`This secret could not be read: ${reason}`);
  }
}

/**
 * §18.4 — how a secret is kept.
 *
 * A port rather than a function so the algorithm is replaceable without
 * touching a use case, and so a test can seal without a real key. The domain
 * never sees a plaintext secret in storage: it holds an opaque string and
 * this is the only thing that knows what is inside.
 */
export interface SecretCipher {
  seal(plaintext: string): string;
  open(sealed: string): Result<string, UnsealableSecretError>;
}

export const SECRET_CIPHER = "secret/SecretCipher";
