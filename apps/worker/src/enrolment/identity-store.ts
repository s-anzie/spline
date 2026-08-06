import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** The pairing request this machine has open, as the hub issued it. */
export interface PendingEnrolment {
  enrolmentId: string;
  code: string;
  expiresAt: string;
}

export interface StoredIdentity {
  /**
   * Generated here, once, and never by the hub. It is what makes an eventual
   * claim provable: knowing the enrolment id is not enough, you also have to
   * be the machine that asked.
   */
  deviceId: string;
  /** Present once this machine has been paired and collected its credential. */
  token?: string;
  actorId?: string;
  /**
   * Present only between asking to be paired and being decided on. Kept here
   * rather than in memory so a restart resumes the same request instead of
   * opening another one — see `TicketStore` in `pairing.ts`.
   */
  pendingEnrolment?: PendingEnrolment;
}

const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;

/**
 * §18.2 — where a paired machine keeps who it is.
 *
 * The file holds a credential that acts as this machine, so it is written
 * owner-only and re-tightened on every write: the preflight refuses to start
 * on a token file the rest of the machine can read, and a store that created
 * one would be handing the daemon a reason to refuse itself.
 */
export class IdentityStore {
  constructor(private readonly path: string) {}

  load(): StoredIdentity | null {
    let raw: string;
    try {
      raw = readFileSync(this.path, "utf8");
    } catch {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as StoredIdentity;
      return typeof parsed.deviceId === "string" && parsed.deviceId !== ""
        ? parsed
        : null;
    } catch {
      // A corrupt state file means "pair again", not "refuse to start
      // forever". The daemon that cannot read its own identity has exactly
      // the same problem as one that never had it.
      return null;
    }
  }

  /** Mints the device id on first use; every call afterwards returns it. */
  ensureDeviceId(): string {
    const existing = this.load();
    if (existing) {
      return existing.deviceId;
    }
    const deviceId = randomUUID();
    this.write({ deviceId });
    return deviceId;
  }

  saveCredential(token: string, actorId: string): void {
    // The pairing request is deliberately not carried over: it has been
    // decided, and a ticket that outlives its decision is a ticket that gets
    // polled forever.
    this.write({ deviceId: this.ensureDeviceId(), token, actorId });
  }

  loadPendingEnrolment(): PendingEnrolment | null {
    return this.load()?.pendingEnrolment ?? null;
  }

  savePendingEnrolment(pending: PendingEnrolment | null): void {
    const identity = this.load() ?? { deviceId: this.ensureDeviceId() };
    this.write({
      ...identity,
      ...(pending ? { pendingEnrolment: pending } : { pendingEnrolment: undefined }),
    });
  }

  private write(identity: StoredIdentity): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: DIRECTORY_MODE });
    writeFileSync(this.path, `${JSON.stringify(identity, null, 2)}\n`, {
      mode: FILE_MODE,
    });
    // `writeFileSync`'s mode applies only when it creates the file, so an
    // existing file keeps whatever permissions it had. Set it every time.
    chmodSync(this.path, FILE_MODE);
  }
}
