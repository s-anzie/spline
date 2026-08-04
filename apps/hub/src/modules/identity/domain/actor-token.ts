import { Result } from "../../../kernel/domain/result";
import { ActorType } from "./actor";
import { MalformedActorTokenError } from "./identity.errors";

/**
 * Opaque token format for non-human actors: `<type>_<credentialId>.<secret>`.
 * The clear id makes the credential an O(1) lookup without indexing secrets;
 * the type prefix makes a leaked token identifiable in logs. Humans are
 * excluded on purpose — they authenticate with JWT (§18.2).
 */
const TOKEN_TYPES: Record<string, Exclude<ActorType, "HUMAN">> = {
  agent: "AGENT",
  worker: "WORKER",
  service: "SERVICE",
};

const TOKEN_PATTERN = /^([a-z]+)_([^.]+)\.(.+)$/;

export interface ParsedActorToken {
  actorType: Exclude<ActorType, "HUMAN">;
  credentialId: string;
  secret: string;
}

export function buildActorToken(
  actorType: Exclude<ActorType, "HUMAN">,
  credentialId: string,
  secret: string,
): string {
  return `${actorType.toLowerCase()}_${credentialId}.${secret}`;
}

export function parseActorToken(
  raw: string,
): Result<ParsedActorToken, MalformedActorTokenError> {
  const match = TOKEN_PATTERN.exec(raw);
  if (!match) {
    return Result.fail(new MalformedActorTokenError());
  }
  const [, prefix, credentialId, secret] = match;
  const actorType = TOKEN_TYPES[prefix as string];
  if (!actorType) {
    return Result.fail(new MalformedActorTokenError());
  }
  return Result.ok({ actorType, credentialId: credentialId as string, secret: secret as string });
}
