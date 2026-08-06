import { Inject, Injectable, Logger } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { Result } from "../../../kernel/domain/result";
import { RefreshSession, SessionRefusal } from "../domain/refresh-session";
import {
  buildSessionToken,
  parseSessionToken,
} from "../domain/refresh-session-token";
import { InvalidCredentialsError } from "../domain/identity.errors";
import {
  REFRESH_SESSION_REPOSITORY,
  RefreshSessionRepository,
  USER_REPOSITORY,
  UserRepository,
} from "../domain/ports/identity.repository.ports";
import {
  PASSWORD_HASHER,
  PasswordHasher,
  SECRET_GENERATOR,
  SecretGenerator,
  TOKEN_SIGNER,
  TokenSigner,
} from "../domain/ports/identity.service.ports";

/**
 * How long a browser stays signed in without touching a password.
 *
 * Thirty days, restarted on every use: a console somebody opens daily never
 * asks again, one abandoned for a month does. Read from the environment
 * rather than injected because it is also what the cookie's `Max-Age` is set
 * to, and the two must not be able to disagree.
 */
export const SESSION_LIFETIME_MS = ((): number => {
  const days = Number(process.env.SESSION_LIFETIME_DAYS);
  const safe = Number.isFinite(days) && days > 0 ? days : 30;
  return safe * 24 * 60 * 60 * 1000;
})();

export interface OpenSessionOutput {
  refreshToken: string;
  expiresAt: Date;
}

/**
 * §18 — hand a browser something it can come back with.
 *
 * Called by signing in, never by a route of its own: there is no way to mint
 * a session credential except by proving a password first.
 */
@Injectable()
export class OpenSessionUseCase
  implements UseCase<{ userId: string }, Result<OpenSessionOutput, never>>
{
  constructor(
    @Inject(REFRESH_SESSION_REPOSITORY)
    private readonly sessions: RefreshSessionRepository,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGenerator,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: { userId: string }): Promise<Result<OpenSessionOutput, never>> {
    const secret = this.secrets.generate();
    const session = RefreshSession.open({
      userId: input.userId,
      tokenHash: await this.hasher.hash(secret),
      now: this.clock.now(),
      lifetimeMs: SESSION_LIFETIME_MS,
    });
    // `open` only fails on an empty user id or a non-positive lifetime, and
    // both are this class's own inputs rather than a caller's.
    if (session.isFailure) {
      throw new Error(`Could not open a session: ${session.error.message}`);
    }
    await this.sessions.save(session.value);
    return Result.ok({
      refreshToken: buildSessionToken(session.value.id.value, secret),
      expiresAt: session.value.expiresAt,
    });
  }
}

export interface RefreshSessionOutput {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  userId: string;
}

/**
 * §18 — trade a session credential for a fresh access token.
 *
 * Three things happen here that are easy to get wrong separately:
 *
 * 1. the presented credential is spent and replaced, so a copy of it stops
 *    working the moment the real browser refreshes;
 * 2. a REPLAYED credential revokes the entire chain, because the copy and the
 *    original are indistinguishable from here — the only safe reading of "two
 *    holders" is that one of them is not the owner;
 * 3. every other refusal — unknown id, wrong secret, malformed — answers the
 *    same `InvalidCredentialsError`, so nothing here can be used to find out
 *    whether a given session id exists.
 */
@Injectable()
export class RefreshSessionUseCase
  implements
    UseCase<
      { presented: string },
      Result<RefreshSessionOutput, InvalidCredentialsError | SessionRefusal>
    >
{
  private readonly logger = new Logger(RefreshSessionUseCase.name);

  constructor(
    @Inject(REFRESH_SESSION_REPOSITORY)
    private readonly sessions: RefreshSessionRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGenerator,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_SIGNER) private readonly signer: TokenSigner,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: {
    presented: string;
  }): Promise<Result<RefreshSessionOutput, InvalidCredentialsError | SessionRefusal>> {
    const parsed = parseSessionToken(input.presented);
    if (parsed.isFailure) {
      return Result.fail(parsed.error);
    }
    const session = await this.sessions.findById(parsed.value.sessionId);
    if (!session) {
      return Result.fail(new InvalidCredentialsError());
    }
    // The secret is checked BEFORE the state. Otherwise "this one is spent"
    // would be answerable by anyone holding only the id, which is the half of
    // the credential that travels in the clear inside our own database.
    const matches = await this.hasher.compare(parsed.value.secret, session.tokenHash);
    if (!matches) {
      return Result.fail(new InvalidCredentialsError());
    }

    const now = this.clock.now();
    const secret = this.secrets.generate();
    const rotated = session.rotate({
      tokenHash: await this.hasher.hash(secret),
      now,
      lifetimeMs: SESSION_LIFETIME_MS,
    });
    if (rotated.isFailure) {
      if (rotated.error.name === "SessionReplayedError") {
        const killed = await this.sessions.revokeFamily(session.familyId, now);
        // Worth a line in the log even though the caller is told: this is the
        // one signal the system has that a cookie was copied.
        this.logger.warn(
          `A spent session credential was presented for user ${session.userId}. ` +
            `${killed} session(s) in that chain were revoked.`,
        );
      }
      return Result.fail(rotated.error as SessionRefusal);
    }

    const user = await this.users.findById(session.userId);
    if (!user) {
      // The account behind the chain is gone. Kill the chain rather than
      // leave credentials that mint tokens for nobody.
      await this.sessions.revokeFamily(session.familyId, now);
      return Result.fail(new InvalidCredentialsError());
    }

    await this.sessions.save(session);
    await this.sessions.save(rotated.value);
    const accessToken = await this.signer.sign({
      sub: session.userId,
      actorType: "HUMAN",
    });
    return Result.ok({
      accessToken,
      refreshToken: buildSessionToken(rotated.value.id.value, secret),
      expiresAt: rotated.value.expiresAt,
      userId: session.userId,
    });
  }
}

/**
 * §18 — signing out.
 *
 * Kills the whole chain, not just the link presented: a session credential is
 * useful only through its successors, and leaving them alive would make
 * "sign out" mean "sign out until the next refresh".
 *
 * Always succeeds. Signing out with a credential that is unknown, malformed
 * or already dead is not an error — the browser is told to drop its cookie
 * either way, and a distinct answer would tell a stranger whether a given
 * session id was real.
 */
@Injectable()
export class CloseSessionUseCase
  implements UseCase<{ presented: string }, Result<{ closed: number }, never>>
{
  constructor(
    @Inject(REFRESH_SESSION_REPOSITORY)
    private readonly sessions: RefreshSessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: { presented: string }): Promise<Result<{ closed: number }, never>> {
    const parsed = parseSessionToken(input.presented);
    if (parsed.isFailure) {
      return Result.ok({ closed: 0 });
    }
    const session = await this.sessions.findById(parsed.value.sessionId);
    if (!session) {
      return Result.ok({ closed: 0 });
    }
    // Still checked: without it, knowing a session id would be enough to sign
    // somebody else out.
    const matches = await this.hasher.compare(parsed.value.secret, session.tokenHash);
    if (!matches) {
      return Result.ok({ closed: 0 });
    }
    const closed = await this.sessions.revokeFamily(session.familyId, this.clock.now());
    return Result.ok({ closed });
  }
}
