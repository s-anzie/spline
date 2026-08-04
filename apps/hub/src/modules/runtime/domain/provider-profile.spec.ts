import { ActorRef } from "../../identity/domain/actor";
import { ProviderProfile } from "./provider-profile";

const now = new Date("2026-08-04T12:00:00Z");
const inAnHour = new Date("2026-08-04T13:00:00Z");
const operator = ActorRef.create("HUMAN", "u-1").value;

function profile(overrides: Record<string, unknown> = {}) {
  return ProviderProfile.register({
    provider: "claude",
    capabilities: ["code", "review"],
    now,
    ...overrides,
  });
}

describe("ProviderProfile", () => {
  /**
   * §4.14 (0.3.7) — "le quota et la disponibilité d'un provider sont une
   * ressource de compte, partagée par construction entre tous les agents qui
   * utilisent la même connexion sous-jacente". This is the only entity in the
   * system without a workspaceId, and that is deliberate: workspace isolation
   * protects a workspace's data, it cannot manufacture a quota the provider
   * does not separate.
   */
  it("belongs to no workspace at all", () => {
    const registered = profile().value;

    expect("workspaceId" in registered).toBe(false);
    expect(registered.provider).toBe("claude");
  });

  it("refuses a profile with no provider name", () => {
    expect(profile({ provider: "  " }).isFailure).toBe(true);
  });

  it("is available when nothing says otherwise", () => {
    const registered = profile().value;

    expect(registered.isAvailableAt(now)).toBe(true);
  });

  /** §4.14 — effective availability is COMPUTED, never a stored field. */
  it("computes availability rather than storing it", () => {
    const registered = profile().value;
    registered.markQuotaExhausted(inAnHour, "429 from the provider", now);

    expect(registered.isAvailableAt(now)).toBe(false);
    // The window passes on its own: nothing has to run for it to come back.
    expect(registered.isAvailableAt(new Date("2026-08-04T13:00:01Z"))).toBe(true);
  });

  it("is unavailable while an operator has switched it off, window or not", () => {
    const registered = profile().value;
    registered.disable(operator, now);

    expect(registered.isAvailableAt(now)).toBe(false);
    expect(registered.isAvailableAt(inAnHour)).toBe(false);
  });

  /**
   * §4.14 (0.3.9), the bug this entity exists to make impossible: a manual
   * re-enable that leaves `quota_unavailable_until` in place "est
   * silencieusement un no-op tant que la fenêtre de quota n'a pas
   * naturellement expiré".
   */
  it("clears the quota window when an operator restores it, so the act is not a no-op", () => {
    const registered = profile().value;
    registered.markQuotaExhausted(inAnHour, "429 from the provider", now);
    registered.disable(operator, now);

    registered.restore(operator, now);

    expect(registered.isAvailableAt(now)).toBe(true);
    expect(registered.quotaUnavailableUntil).toBeNull();
    expect(registered.quotaReason).toBeNull();
  });

  /** The other half of the same invariant, and it is not symmetric. */
  it("never invents a quota reason when an operator simply switches it off", () => {
    const registered = profile().value;

    registered.disable(operator, now);

    expect(registered.available).toBe(false);
    // A manual decision is not an observation about quota.
    expect(registered.quotaReason).toBeNull();
    expect(registered.quotaUnavailableUntil).toBeNull();
  });

  it("keeps the reason a quota exhaustion was recorded with", () => {
    const registered = profile().value;

    registered.markQuotaExhausted(inAnHour, "exit code 3, stderr: rate limit", now);

    expect(registered.quotaReason).toBe("exit code 3, stderr: rate limit");
    expect(registered.quotaUnavailableUntil).toEqual(inAnHour);
  });

  it("refuses a quota window that has already passed", () => {
    const registered = profile().value;

    const result = registered.markQuotaExhausted(
      new Date("2026-08-04T11:00:00Z"),
      "stale",
      now,
    );

    expect(result.isFailure).toBe(true);
    expect(registered.isAvailableAt(now)).toBe(true);
  });

  it("refuses a quota exhaustion with no reason — an unexplained lockout is unactionable", () => {
    const registered = profile().value;

    expect(registered.markQuotaExhausted(inAnHour, "  ", now).isFailure).toBe(true);
  });

  it("raises facts a journal can read, above any workspace", () => {
    const registered = profile().value;
    registered.clearDomainEvents();

    registered.markQuotaExhausted(inAnHour, "429", now);

    expect(registered.domainEvents[0]?.eventName).toBe("runtime.provider_unavailable");
    // Above workspaces, like a user registering (§4.20).
    expect(registered.domainEvents[0]?.workspaceId).toBeNull();
  });
});
