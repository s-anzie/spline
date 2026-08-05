import { CheckInCandidate, DEFAULT_CHECKPOINT_MS, checkInsDue } from "./check-in";

const now = new Date("2026-08-05T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function candidate(overrides: Partial<CheckInCandidate> = {}): CheckInCandidate {
  return {
    actor: { type: "AGENT", id: "a-1" },
    lastAssignedAt: new Date(now.getTime() - 10 * HOUR),
    hasActionableWork: false,
    ...overrides,
  };
}

describe("checkInsDue", () => {
  /**
   * §9.16, and the observation 0.3.10 behind it: "un système entièrement à
   * jour finit par se taire pour de bon, sans qu'aucun signal n'indique à
   * personne qu'un nouveau travail est nécessaire". Silence is the failure
   * mode, and nothing else in the system reports it.
   */
  it("names an actor who has had nothing for longer than the checkpoint", () => {
    const due = checkInsDue([candidate()], DEFAULT_CHECKPOINT_MS, now);

    expect(due).toHaveLength(1);
    expect(due[0]?.actor.id).toBe("a-1");
    expect(due[0]?.silentForMs).toBe(10 * HOUR);
  });

  /** The spec's condition is an AND: work in hand is not silence. */
  it("leaves alone an actor who has something to do", () => {
    expect(
      checkInsDue([candidate({ hasActionableWork: true })], DEFAULT_CHECKPOINT_MS, now),
    ).toEqual([]);
  });

  it("leaves alone an actor who was given something recently", () => {
    expect(
      checkInsDue(
        [candidate({ lastAssignedAt: new Date(now.getTime() - 60_000) })],
        DEFAULT_CHECKPOINT_MS,
        now,
      ),
    ).toEqual([]);
  });

  /**
   * An actor that has never been given anything is the most silent of all.
   * `isStale(null)` is true for exactly this reason — the doubt plays against
   * availability, never for it.
   */
  it("counts an actor who has never been given anything", () => {
    const due = checkInsDue([candidate({ lastAssignedAt: null })], DEFAULT_CHECKPOINT_MS, now);

    expect(due).toHaveLength(1);
    expect(due[0]?.silentForMs).toBeNull();
    // §17.8 — the reason travels with the name, so it is actionable.
    expect(due[0]?.reason).toMatch(/never/i);
  });

  it("orders the most silent first, so attention goes where it is oldest", () => {
    const due = checkInsDue(
      [
        candidate({ actor: { type: "AGENT", id: "recent" }, lastAssignedAt: new Date(now.getTime() - 9 * HOUR) }),
        candidate({ actor: { type: "AGENT", id: "never" }, lastAssignedAt: null }),
        candidate({ actor: { type: "AGENT", id: "old" }, lastAssignedAt: new Date(now.getTime() - 40 * HOUR) }),
      ],
      DEFAULT_CHECKPOINT_MS,
      now,
    );

    expect(due.map((entry) => entry.actor.id)).toEqual(["never", "old", "recent"]);
  });

  it("honours a workspace that wants a shorter or longer checkpoint", () => {
    const recent = [candidate({ lastAssignedAt: new Date(now.getTime() - 2 * HOUR) })];

    expect(checkInsDue(recent, 1 * HOUR, now)).toHaveLength(1);
    expect(checkInsDue(recent, 24 * HOUR, now)).toEqual([]);
  });

  /**
   * The checkpoint is deliberately longer than reactive dispatch latency
   * (§9.16): there is nothing urgent to handle, only a presence to confirm.
   * Stated as a test so the default cannot quietly become a poll.
   */
  it("defaults to a checkpoint measured in hours, not seconds", () => {
    expect(DEFAULT_CHECKPOINT_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });
});
