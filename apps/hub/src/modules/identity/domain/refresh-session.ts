import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import {
  SessionExpiredError,
  SessionReplayedError,
  SessionRevokedError,
} from "./identity.errors";

interface RefreshSessionProps {
  userId: string;
  /**
   * The chain this link belongs to, named after its first link.
   *
   * Carried on every link so that revoking a chain is one indexed write, not
   * a walk. It is what makes the theft response possible at all: when a used
   * credential comes back, the successor the thief also holds has to die, and
   * the only thing tying them together is this.
   */
  familyId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  /** When it was exchanged for its successor. Set once, never moved. */
  usedAt: Date | null;
  revokedAt: Date | null;
}

export interface OpenSessionInput {
  userId: string;
  tokenHash: string;
  now: Date;
  lifetimeMs: number;
}

export interface RotateSessionInput {
  tokenHash: string;
  now: Date;
  lifetimeMs: number;
}

export type SessionRefusal =
  | SessionExpiredError
  | SessionRevokedError
  | SessionReplayedError;

/**
 * §18 — one link in a browser's chain of session credentials.
 *
 * The access token is short-lived and lives in the tab's memory, where no
 * script from another page can read it. That is the right place for it and it
 * is also why a reload used to sign somebody out. This is the other half: a
 * long-lived credential the browser holds in an httpOnly cookie, which buys a
 * new access token and NOTHING else — it names no permission and opens no
 * route.
 *
 * Rotation on every use, single use, and a replay kills the chain. Without
 * rotation, a copied cookie works for its full lifetime and nobody ever
 * learns it was copied; with it, the copy and the original race, the loser
 * presents a spent credential, and that is the alarm.
 */
export class RefreshSession extends AggregateRoot<RefreshSessionProps> {
  static open(
    input: OpenSessionInput,
    id?: UniqueEntityId,
  ): Result<RefreshSession, GuardViolation> {
    const userId = Guard.againstEmpty(input.userId, "userId");
    if (userId.isFailure) {
      return Result.fail(userId.error);
    }
    const tokenHash = Guard.againstEmpty(input.tokenHash, "tokenHash");
    if (tokenHash.isFailure) {
      return Result.fail(tokenHash.error);
    }
    const lifetime = Guard.againstNonPositive(input.lifetimeMs, "lifetimeMs");
    if (lifetime.isFailure) {
      return Result.fail(lifetime.error);
    }

    const identity = id ?? new UniqueEntityId();
    return Result.ok(
      new RefreshSession(
        {
          userId: input.userId,
          // A new chain is named after itself: there is no earlier link.
          familyId: identity.value,
          tokenHash: input.tokenHash,
          issuedAt: input.now,
          expiresAt: new Date(input.now.getTime() + input.lifetimeMs),
          usedAt: null,
          revokedAt: null,
        },
        identity,
      ),
    );
  }

  /** Rebuild from persistence. */
  static reconstitute(props: RefreshSessionProps, id: string): RefreshSession {
    return new RefreshSession(props, new UniqueEntityId(id));
  }

  get userId(): string {
    return this.props.userId;
  }

  get familyId(): string {
    return this.props.familyId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get issuedAt(): Date {
    return this.props.issuedAt;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get usedAt(): Date | null {
    return this.props.usedAt;
  }

  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }

  /**
   * Whether this link may still be exchanged, and if not, WHY.
   *
   * The order matters. A revoked-and-used link reports as replayed only if
   * revocation is checked first — and it must not, because a chain that was
   * already killed by an earlier replay would then report the theft twice and
   * the second report would be noise. Revoked is the calmer, truer answer.
   */
  redeemableAt(now: Date): Result<void, SessionRefusal> {
    if (this.props.revokedAt) {
      return Result.fail(new SessionRevokedError());
    }
    if (this.props.usedAt) {
      return Result.fail(new SessionReplayedError());
    }
    if (now.getTime() >= this.props.expiresAt.getTime()) {
      return Result.fail(new SessionExpiredError());
    }
    return Result.ok(undefined);
  }

  /**
   * Spend this link and mint the next one in the same chain.
   *
   * The lifetime restarts, which is what makes a session that is in daily use
   * never expire while one abandoned for a month does. The ceiling on that is
   * a policy question (an absolute maximum age), and it is not invented here.
   */
  rotate(
    input: RotateSessionInput,
  ): Result<RefreshSession, SessionRefusal | GuardViolation> {
    const redeemable = this.redeemableAt(input.now);
    if (redeemable.isFailure) {
      return Result.fail(redeemable.error);
    }
    const next = RefreshSession.open({
      userId: this.props.userId,
      tokenHash: input.tokenHash,
      now: input.now,
      lifetimeMs: input.lifetimeMs,
    });
    if (next.isFailure) {
      return Result.fail(next.error);
    }

    this.props.usedAt = input.now;
    // The successor joins THIS chain rather than starting one: that is what
    // a later replay walks to find everything the thief holds.
    next.value.props.familyId = this.props.familyId;
    return Result.ok(next.value);
  }

  /** Idempotent, and it never moves the stamp: when is evidence. */
  revoke(now: Date): void {
    if (!this.props.revokedAt) {
      this.props.revokedAt = now;
    }
  }
}
