import { WorkerEnrolment } from "./worker-enrolment";

const now = new Date("2026-08-05T10:00:00.000Z");
const soon = new Date("2026-08-05T10:05:00.000Z");
const late = new Date("2026-08-05T10:20:00.000Z");

function requested(overrides: Record<string, unknown> = {}) {
  return WorkerEnrolment.request({
    deviceId: "device-abc",
    hostname: "workshop-01",
    architecture: "x86_64",
    operatingSystem: "linux",
    capabilities: ["docker"],
    labels: [],
    code: "K7QM4T2X",
    now,
    ...overrides,
  });
}

describe("WorkerEnrolment", () => {
  it("starts pending: a machine that asks is not yet a machine that may", () => {
    const enrolment = requested().value;

    expect(enrolment.status).toBe("PENDING");
    expect(enrolment.hostname).toBe("workshop-01");
    expect(enrolment.capabilities).toEqual(["docker"]);
  });

  it("refuses a request that names no device", () => {
    expect(requested({ deviceId: "  " }).isFailure).toBe(true);
  });

  describe("approval", () => {
    it("moves to approved, recording who decided and when", () => {
      const enrolment = requested().value;

      const approved = enrolment.approve("org-1", "u-1", soon);

      expect(approved.isSuccess).toBe(true);
      expect(enrolment.status).toBe("APPROVED");
      expect(enrolment.decidedBy).toBe("u-1");
      // The machine never named it: the approver did.
      expect(enrolment.organizationId).toBe("org-1");
    });

    /**
     * The window is the point. A pairing code that never expires is a
     * password printed on a console — OpenClaw expires its pending requests
     * minutes after the last retry, and for the same reason.
     */
    it("refuses to approve a request that has expired", () => {
      const enrolment = requested().value;

      const approved = enrolment.approve("org-1", "u-1", late);

      expect(approved.isFailure).toBe(true);
      expect(enrolment.status).toBe("PENDING");
    });

    it("reports expiry as a state anyone can read, not only as a refusal", () => {
      const enrolment = requested().value;

      expect(enrolment.hasExpiredAt(soon)).toBe(false);
      expect(enrolment.hasExpiredAt(late)).toBe(true);
    });

    it("refuses to approve twice: a code is spent when it is used", () => {
      const enrolment = requested().value;
      enrolment.approve("org-1", "u-1", soon);

      expect(enrolment.approve("org-1", "u-2", soon).isFailure).toBe(true);
      expect(enrolment.decidedBy).toBe("u-1");
    });

    it("can be rejected instead, which is equally final", () => {
      const enrolment = requested().value;

      expect(enrolment.reject("u-1", soon).isSuccess).toBe(true);
      expect(enrolment.status).toBe("REJECTED");
      expect(enrolment.approve("org-1", "u-1", soon).isFailure).toBe(true);
    });
  });

  describe("claiming", () => {
    /**
     * §18 — the token is minted at claim, never at approval, so no plaintext
     * credential ever waits at rest for somebody to read.
     */
    it("is claimable once approved, by the device that asked", () => {
      const enrolment = requested().value;
      enrolment.approve("org-1", "u-1", soon);

      expect(enrolment.claim("device-abc", soon).isSuccess).toBe(true);
      expect(enrolment.status).toBe("CLAIMED");
    });

    it("refuses a different device, whatever it knows", () => {
      const enrolment = requested().value;
      enrolment.approve("org-1", "u-1", soon);

      expect(enrolment.claim("device-other", soon).isFailure).toBe(true);
      expect(enrolment.status).toBe("APPROVED");
    });

    it("refuses before approval: waiting is not the same as being allowed", () => {
      const enrolment = requested().value;

      expect(enrolment.claim("device-abc", soon).isFailure).toBe(true);
    });

    /** A credential is handed over exactly once, or it is not a handover. */
    it("refuses a second claim", () => {
      const enrolment = requested().value;
      enrolment.approve("org-1", "u-1", soon);
      enrolment.claim("device-abc", soon);

      expect(enrolment.claim("device-abc", soon).isFailure).toBe(true);
    });
  });

  /**
   * §9.9 — capabilities steer which work a machine attracts, so a machine
   * that grows a new one is asking for something it was not approved for.
   * OpenClaw re-opens a pending request when a node's surface expands; the
   * same rule, expressed where it can be checked.
   */
  describe("the approved capability surface", () => {
    it("accepts the same surface again", () => {
      const enrolment = requested().value;

      expect(enrolment.covers(["docker"])).toBe(true);
      expect(enrolment.covers([])).toBe(true);
    });

    it("does not cover a surface that grew", () => {
      const enrolment = requested().value;

      expect(enrolment.covers(["docker", "gpu"])).toBe(false);
    });
  });
});
