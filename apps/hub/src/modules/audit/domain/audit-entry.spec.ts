import { ActorRef } from "../../identity/domain/actor";
import { AuditEntry } from "./audit-entry";
import { signEntry, verifyChain } from "./audit-signature";

const now = new Date("2026-08-04T10:00:00Z");
const actor = ActorRef.create("HUMAN", "u-1").value;
const KEY = "a-test-signing-key";

function record(overrides: Record<string, unknown> = {}) {
  return AuditEntry.record({
    workspaceId: "w-1",
    actor,
    action: "permission.changed",
    targetType: "membership",
    targetId: "m-1",
    before: { role: "VIEWER" },
    after: { role: "OWNER" },
    now,
    ...overrides,
  });
}

describe("AuditEntry", () => {
  it("records what changed, from what to what, and by whom", () => {
    const result = record();

    expect(result.isSuccess).toBe(true);
    const entry = result.value;
    expect(entry.action).toBe("permission.changed");
    expect(entry.actor.actorId).toBe("u-1");
    expect(entry.before).toEqual({ role: "VIEWER" });
    expect(entry.after).toEqual({ role: "OWNER" });
    expect(entry.createdAt).toEqual(now);
  });

  it("refuses an entry with no action or no target", () => {
    expect(record({ action: " " }).isFailure).toBe(true);
    expect(record({ targetType: "" }).isFailure).toBe(true);
    expect(record({ targetId: "  " }).isFailure).toBe(true);
  });

  /** A creation has no before; a deletion has no after. Both are legitimate. */
  it("accepts a missing before or after", () => {
    expect(record({ before: null }).isSuccess).toBe(true);
    expect(record({ after: null }).isSuccess).toBe(true);
  });

  /** Above a workspace: an organisation-level change belongs to no single one. */
  it("accepts an entry that sits above any workspace", () => {
    const entry = record({ workspaceId: null });

    expect(entry.isSuccess).toBe(true);
    expect(entry.value.workspaceId).toBeNull();
  });

  /** §4.23 "l'audit est immuable" — there is no way to change one. */
  it("exposes no mutation at all", () => {
    const entry = record().value;
    const mutators = Object.getOwnPropertyNames(
      Object.getPrototypeOf(entry) as object,
    ).filter((name) => /^(update|change|set|edit|delete|disable|archive)/.test(name));

    expect(mutators).toEqual([]);
  });
});

describe("audit signature chain", () => {
  const entryAt = (sequence: bigint, targetId: string) =>
    AuditEntry.reconstitute(
      {
        workspaceId: "w-1",
        actor,
        action: "permission.changed",
        targetType: "membership",
        targetId,
        before: null,
        after: { role: "OWNER" },
        sequence,
        signature: "",
        createdAt: now,
      },
      `id-${sequence}`,
    );

  function chainOf(count: number): AuditEntry[] {
    const entries: AuditEntry[] = [];
    let previous = "";
    for (let i = 1; i <= count; i++) {
      const entry = entryAt(BigInt(i), `m-${i}`);
      previous = signEntry(entry, previous, KEY);
      entries.push(
        AuditEntry.reconstitute(
          { ...entry.snapshot(), signature: previous },
          entry.id.value,
        ),
      );
    }
    return entries;
  }

  it("signs each entry over its content and the one before it", () => {
    const [first, second] = chainOf(2);

    expect(first?.signature).not.toBe("");
    expect(second?.signature).not.toBe(first?.signature);
  });

  it("verifies an untouched chain", () => {
    const result = verifyChain(chainOf(4), KEY);

    expect(result.intact).toBe(true);
    expect(result.brokenAt).toBeNull();
  });

  /**
   * §4.23 says immutable, but a Postgres table is immutable for nobody with
   * database access. The honest meaning of the word is "tampering is
   * detectable" — and detectable *where* (§17.8), not merely "somewhere".
   */
  it("says exactly where an altered entry breaks the chain", () => {
    const chain = chainOf(4);
    const tampered = AuditEntry.reconstitute(
      { ...chain[1]!.snapshot(), after: { role: "VIEWER" } },
      chain[1]!.id.value,
    );

    const result = verifyChain([chain[0]!, tampered, chain[2]!, chain[3]!], KEY);

    expect(result.intact).toBe(false);
    expect(result.brokenAt).toEqual({ id: chain[1]!.id.value, sequence: 2n });
  });

  it("detects a removed entry, not just a modified one", () => {
    const chain = chainOf(4);

    const result = verifyChain([chain[0]!, chain[2]!, chain[3]!], KEY);

    expect(result.intact).toBe(false);
    expect(result.brokenAt?.sequence).toBe(3n);
  });

  it("detects reordering", () => {
    const chain = chainOf(3);

    const result = verifyChain([chain[1]!, chain[0]!, chain[2]!], KEY);

    expect(result.intact).toBe(false);
  });

  /** Without the key, a rewritten chain cannot be made to verify. */
  it("does not verify under a different key", () => {
    expect(verifyChain(chainOf(3), "another-key").intact).toBe(false);
  });

  it("verifies an empty chain rather than treating it as broken", () => {
    expect(verifyChain([], KEY).intact).toBe(true);
  });
});
