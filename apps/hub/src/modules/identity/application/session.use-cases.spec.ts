import { FakeClock } from "../../../kernel/testing/fake-clock";
import { RefreshSession } from "../domain/refresh-session";
import { RefreshSessionRepository } from "../domain/ports/identity.repository.ports";
import {
  CloseSessionUseCase,
  OpenSessionUseCase,
  RefreshSessionUseCase,
  SESSION_LIFETIME_MS,
} from "./session.use-cases";
import {
  FakePasswordHasher,
  FakeSecretGenerator,
  FakeTokenSigner,
  InMemoryUserRepository,
} from "./testing/identity.doubles";
import { Email } from "../domain/email";
import { User } from "../domain/user";

class InMemoryRefreshSessionRepository implements RefreshSessionRepository {
  readonly sessions = new Map<string, RefreshSession>();

  async save(session: RefreshSession): Promise<void> {
    this.sessions.set(session.id.value, session);
  }

  async findById(id: string): Promise<RefreshSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async revokeFamily(familyId: string, now: Date): Promise<number> {
    let killed = 0;
    for (const session of this.sessions.values()) {
      if (session.familyId === familyId && !session.revokedAt) {
        session.revoke(now);
        killed += 1;
      }
    }
    return killed;
  }

  async deleteExpiredBefore(cutoff: Date): Promise<number> {
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (session.expiresAt.getTime() < cutoff.getTime()) {
        this.sessions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}

/**
 * §18 — signing in once and staying signed in.
 *
 * The three operations a browser needs, and the theft response that makes
 * them safe to hand a cookie.
 */
describe("Session use-cases", () => {
  const now = new Date("2026-03-01T09:00:00.000Z");

  const build = async () => {
    const clock = new FakeClock(now);
    const sessions = new InMemoryRefreshSessionRepository();
    const users = new InMemoryUserRepository();
    const hasher = new FakePasswordHasher();
    const signer = new FakeTokenSigner();
    const secrets = new FakeSecretGenerator();

    const user = User.create({
      email: Email.create("ada@example.com").value,
      passwordHash: "hashed:pw",
      displayName: "Ada",
      now,
    });
    await users.save(user.value);

    return {
      clock,
      sessions,
      userId: user.value.id.value,
      open: new OpenSessionUseCase(sessions, secrets, hasher, clock),
      refresh: new RefreshSessionUseCase(sessions, users, secrets, hasher, signer, clock),
      close: new CloseSessionUseCase(sessions, hasher, clock),
    };
  };

  it("opens a session and hands back a credential the browser can keep", async () => {
    const { open, sessions, userId } = await build();

    const opened = await open.execute({ userId });
    expect(opened.isSuccess).toBe(true);
    // `<id>.<secret>`: the id makes the lookup O(1), the secret is what is
    // checked, and only its hash is stored.
    const [id, secret] = opened.value.refreshToken.split(".");
    expect(id).toBeTruthy();
    expect(secret).toBeTruthy();
    const stored = await sessions.findById(id as string);
    expect(stored).not.toBeNull();
    // The secret itself is never what is stored. `FakePasswordHasher` is
    // deliberately reversible, so asserting more than this would be testing
    // the double rather than the code; bcrypt is what the container binds.
    expect(stored?.tokenHash).not.toBe(secret);
    expect(opened.value.expiresAt.getTime()).toBe(now.getTime() + SESSION_LIFETIME_MS);
  });

  it("exchanges it for an access token, and rotates it in the same breath", async () => {
    const { open, refresh, userId } = await build();
    const opened = await open.execute({ userId });

    const refreshed = await refresh.execute({ presented: opened.value.refreshToken });
    expect(refreshed.isSuccess).toBe(true);
    expect(refreshed.value.userId).toBe(userId);
    expect(refreshed.value.accessToken).toBe(`jwt:${userId}`);
    // A new credential every time: the one the browser just used is spent.
    expect(refreshed.value.refreshToken).not.toBe(opened.value.refreshToken);
  });

  it("refuses the spent one, and kills the whole chain when it comes back", async () => {
    const { open, refresh, sessions, userId } = await build();
    const opened = await open.execute({ userId });
    const first = await refresh.execute({ presented: opened.value.refreshToken });
    const second = await refresh.execute({ presented: first.value.refreshToken });

    // The stolen copy is replayed after the legitimate holder rotated.
    const replay = await refresh.execute({ presented: opened.value.refreshToken });
    expect(replay.isFailure).toBe(true);
    expect(replay.error.name).toBe("SessionReplayedError");

    // Every link dies, including the one the thief would try next.
    for (const session of sessions.sessions.values()) {
      expect(session.revokedAt).not.toBeNull();
    }
    const afterwards = await refresh.execute({ presented: second.value.refreshToken });
    expect(afterwards.isFailure).toBe(true);
  });

  it("refuses a credential whose secret is wrong, without saying which part was", async () => {
    const { open, refresh, userId } = await build();
    const opened = await open.execute({ userId });
    const [id] = opened.value.refreshToken.split(".");

    const forged = await refresh.execute({ presented: `${id}.not-the-secret` });
    expect(forged.isFailure).toBe(true);
    expect(forged.error.name).toBe("InvalidCredentialsError");

    const unknown = await refresh.execute({ presented: "nobody.nothing" });
    expect(unknown.isFailure).toBe(true);
    expect(unknown.error.name).toBe("InvalidCredentialsError");

    const shapeless = await refresh.execute({ presented: "no-dot-at-all" });
    expect(shapeless.isFailure).toBe(true);
    expect(shapeless.error.name).toBe("InvalidCredentialsError");
  });

  it("refuses an expired credential", async () => {
    const { open, refresh, clock, userId } = await build();
    const opened = await open.execute({ userId });

    clock.advance(SESSION_LIFETIME_MS + 1);
    const late = await refresh.execute({ presented: opened.value.refreshToken });
    expect(late.isFailure).toBe(true);
    expect(late.error.name).toBe("SessionExpiredError");
  });

  it("refuses a session whose account is gone", async () => {
    const { open, refresh, userId } = await build();
    const opened = await open.execute({ userId });
    // Deleting the account is not modelled; a session naming an unknown user
    // is the same situation and must not mint a token for a ghost.
    const stray = await open.execute({ userId: "someone-who-never-existed" });
    const answer = await refresh.execute({ presented: stray.value.refreshToken });
    expect(answer.isFailure).toBe(true);
    expect(opened.value.refreshToken).toBeTruthy();
  });

  it("signing out kills the chain, and says nothing about what it found", async () => {
    const { open, refresh, close, userId } = await build();
    const opened = await open.execute({ userId });

    const out = await close.execute({ presented: opened.value.refreshToken });
    expect(out.isSuccess).toBe(true);

    const after = await refresh.execute({ presented: opened.value.refreshToken });
    expect(after.isFailure).toBe(true);

    // Signing out twice, or with nonsense, is not an error: the browser is
    // told to forget its cookie either way, and a distinct answer here would
    // tell a stranger whether a credential was real.
    expect((await close.execute({ presented: opened.value.refreshToken })).isSuccess).toBe(
      true,
    );
    expect((await close.execute({ presented: "garbage" })).isSuccess).toBe(true);
  });
});
