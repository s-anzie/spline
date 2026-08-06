import { Result } from "../../../kernel/domain/result";
import { InvalidCredentialsError } from "./identity.errors";

/**
 * `<sessionId>.<secret>` — the credential a browser holds in its cookie.
 *
 * Same shape as an actor token and for the same reason: the clear id makes
 * the lookup a primary-key read, so the secret never has to be indexed, and
 * only its hash is ever stored. No type prefix here — this format is reachable
 * from exactly one route and would gain nothing from being self-describing.
 */
export interface ParsedSessionToken {
  sessionId: string;
  secret: string;
}

export function buildSessionToken(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}

/**
 * Every malformed shape fails as `InvalidCredentialsError`, the same error a
 * wrong secret gets. A distinct "malformed" answer would tell a caller which
 * half they got wrong, which is a free oracle nobody legitimate needs.
 */
export function parseSessionToken(
  raw: string,
): Result<ParsedSessionToken, InvalidCredentialsError> {
  const at = raw.indexOf(".");
  if (at <= 0 || at === raw.length - 1) {
    return Result.fail(new InvalidCredentialsError());
  }
  return Result.ok({ sessionId: raw.slice(0, at), secret: raw.slice(at + 1) });
}
