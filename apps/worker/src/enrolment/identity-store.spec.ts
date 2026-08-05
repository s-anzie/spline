import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { IdentityStore } from "./identity-store";

describe("IdentityStore", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "spline-identity-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function store(): IdentityStore {
    return new IdentityStore(join(dir, "state", "identity.json"));
  }

  it("has nothing to say before the machine has ever paired", () => {
    expect(store().load()).toBeNull();
  });

  /**
   * The device id is what makes an eventual claim provable: knowing the
   * enrolment id is not enough, you must be the machine that asked. So it is
   * generated here, once, and kept.
   */
  it("mints a device id on first use and keeps it afterwards", () => {
    const first = store().ensureDeviceId();
    const second = store().ensureDeviceId();

    expect(first).toHaveLength(36);
    expect(second).toBe(first);
  });

  it("remembers the token it was handed", () => {
    const it1 = store();
    it1.ensureDeviceId();
    it1.saveCredential("worker_c-1.secret", "actor-1");

    const reloaded = store().load();
    expect(reloaded?.token).toBe("worker_c-1.secret");
    expect(reloaded?.actorId).toBe("actor-1");
  });

  /**
   * §18 — the file holds a credential that acts as this machine. A token file
   * the rest of the machine can read is a token the rest of the machine has,
   * and the preflight refuses to start on one — so writing it correctly in
   * the first place is not optional.
   */
  describe("what it writes is readable by its owner and nobody else", () => {
    it("creates the file owner-only", () => {
      store().ensureDeviceId();

      const mode = statSync(join(dir, "state", "identity.json")).mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it("creates the directory owner-only too", () => {
      store().ensureDeviceId();

      expect(statSync(join(dir, "state")).mode & 0o777).toBe(0o700);
    });

    it("tightens a file that was already too open", () => {
      const path = join(dir, "identity.json");
      writeFileSync(path, JSON.stringify({ deviceId: "d-1" }), { mode: 0o644 });

      const loose = new IdentityStore(path);
      loose.saveCredential("worker_c.s", "a-1");

      expect(statSync(path).mode & 0o777).toBe(0o600);
    });
  });

  it("survives a file that is not valid JSON rather than crashing the daemon", () => {
    const path = join(dir, "identity.json");
    writeFileSync(path, "{ not json", { mode: 0o600 });

    // A corrupt state file means "pair again", not "refuse to start forever".
    expect(new IdentityStore(path).load()).toBeNull();
  });
});
