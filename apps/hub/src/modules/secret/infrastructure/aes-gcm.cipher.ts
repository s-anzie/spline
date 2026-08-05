import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { Result } from "../../../kernel/domain/result";
import {
  SecretCipher,
  UnsealableSecretError,
} from "../domain/ports/secret-cipher.port";

/** AES-256 needs exactly 32 bytes; GCM's standard nonce is 96 bits. */
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Stamped on every sealed value so a future key rotation can tell what it is
 * looking at. Without it, changing the format means guessing at every stored
 * row — and guessing wrong on a secret is unrecoverable.
 */
const FORMAT = "v1";

/**
 * §18.4 — AES-256-GCM, and the choice of GCM is the point.
 *
 * It authenticates as well as encrypts: a row an attacker edited does not
 * decrypt to something the attacker chose, it fails. With a cipher that only
 * encrypts, someone with write access to the database could flip bytes until
 * a secret decrypted to a value they controlled — and the system would use it
 * as if it were genuine.
 *
 * A fresh IV per seal, because a deterministic ciphertext leaks equality: two
 * workspaces holding the same provider key would be visibly holding the same
 * key to anyone who can read the table.
 */
export class AesGcmCipher implements SecretCipher {
  private readonly key: Buffer;

  constructor(hexKey: string) {
    if (!/^[0-9a-fA-F]+$/.test(hexKey) || hexKey.length !== KEY_BYTES * 2) {
      /**
       * Refused where it is CONFIGURED, not where it is used. A short key is
       * not a weaker key — it is a different algorithm wearing this one's
       * name, and finding that out at the first decryption would mean
       * finding it out in production.
       */
      throw new Error(
        `SECRET_ENCRYPTION_KEY must be ${KEY_BYTES} bytes of hex (${KEY_BYTES * 2} characters)`,
      );
    }
    this.key = Buffer.from(hexKey, "hex");
  }

  seal(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return [
      FORMAT,
      iv.toString("hex"),
      cipher.getAuthTag().toString("hex"),
      body.toString("hex"),
    ].join(".");
  }

  open(sealed: string): Result<string, UnsealableSecretError> {
    const parts = sealed.split(".");
    if (parts.length !== 4 || parts[0] !== FORMAT) {
      return Result.fail(new UnsealableSecretError("it is not in a format this knows"));
    }
    const [, iv, tag, body] = parts as [string, string, string, string];
    if (!isHex(iv, IV_BYTES) || !isHex(tag, TAG_BYTES) || !isHex(body)) {
      return Result.fail(new UnsealableSecretError("it is malformed"));
    }

    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "hex"));
      decipher.setAuthTag(Buffer.from(tag, "hex"));
      const opened = Buffer.concat([
        decipher.update(Buffer.from(body, "hex")),
        // Throws when the tag does not match: this is the authentication.
        decipher.final(),
      ]);
      return Result.ok(opened.toString("utf8"));
    } catch {
      /**
       * One message for every failure, deliberately. Distinguishing "wrong
       * key" from "tampered" would tell somebody probing the store which of
       * the two they achieved.
       */
      return Result.fail(
        new UnsealableSecretError("it failed authentication — wrong key, or altered"),
      );
    }
  }
}

function isHex(value: string, bytes?: number): boolean {
  if (!/^[0-9a-f]*$/i.test(value) || value.length % 2 !== 0) {
    return false;
  }
  return bytes === undefined || value.length === bytes * 2;
}
