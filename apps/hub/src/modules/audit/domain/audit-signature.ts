import { createHmac, timingSafeEqual } from "node:crypto";

import { AuditEntry } from "./audit-entry";

/**
 * §4.23 calls the audit immutable and gives it a `signature` field. A Postgres
 * table is immutable for nobody holding database access, so the only honest
 * meaning of the word is **detectable tampering**.
 *
 * Each entry is signed over its own content AND the previous signature, so
 * modifying, deleting or reordering a row breaks every signature after it.
 * Without the key the chain cannot be recomputed.
 *
 * What this is NOT: proof of anteriority. Someone holding both the key and
 * database access can rewrite the whole chain; guarding against that needs an
 * external anchor (append-only log, third-party timestamp) which does not
 * exist here. Said out loud rather than implied.
 */
export function signEntry(
  entry: AuditEntry,
  previousSignature: string,
  key: string,
): string {
  // Field order is part of the contract: a different order is a different
  // signature, so it is written once, here, rather than left to an object's
  // key order — which JSON.stringify would happily change under us.
  const payload = [
    entry.id.value,
    entry.sequence.toString(),
    entry.workspaceId ?? "",
    entry.actor.type,
    entry.actor.actorId,
    entry.action,
    entry.targetType,
    entry.targetId,
    stable(entry.before),
    stable(entry.after),
    entry.createdAt.toISOString(),
    previousSignature,
  ].join(" ");
  return createHmac("sha256", key).update(payload).digest("hex");
}

export interface ChainVerification {
  intact: boolean;
  /** §17.8 — where it breaks, not merely that something does. */
  brokenAt: { id: string; sequence: bigint } | null;
  checked: number;
}

/** Entries must arrive in ascending sequence — as the repository returns them. */
export function verifyChain(
  entries: readonly AuditEntry[],
  key: string,
): ChainVerification {
  let previous = "";
  for (const entry of entries) {
    const expected = signEntry(entry, previous, key);
    if (!equals(expected, entry.signature)) {
      return {
        intact: false,
        brokenAt: { id: entry.id.value, sequence: entry.sequence },
        checked: entries.length,
      };
    }
    previous = entry.signature;
  }
  return { intact: true, brokenAt: null, checked: entries.length };
}

function equals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // Constant-time, length-checked first because timingSafeEqual throws on a
  // length mismatch rather than returning false.
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Key order must not change a signature, so it is sorted before hashing. */
function stable(value: Record<string, unknown> | null): string {
  if (value === null) {
    return "";
  }
  return JSON.stringify(
    Object.keys(value)
      .sort()
      .map((key) => [key, value[key]]),
  );
}
