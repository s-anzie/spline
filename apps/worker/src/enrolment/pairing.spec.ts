import { EnrolmentTicket, PairingHub, pairMachine, TicketStore } from "./pairing";

function hub(overrides: Partial<PairingHub> = {}): PairingHub {
  return {
    requestEnrolment: async () => ({
      enrolmentId: "e-1",
      code: "K7QM4T2X",
      expiresAt: "2026-08-05T10:10:00.000Z",
    }),
    claimEnrolment: async () => ({ status: "approved", token: "worker_c.s", actorId: "a-1" }),
    ...overrides,
  };
}

/** The one open request this machine has, as the daemon would remember it. */
function tickets(held: EnrolmentTicket | null = null): TicketStore & { held: () => EnrolmentTicket | null } {
  let current = held;
  return {
    load: () => current,
    save: (ticket) => {
      current = ticket;
    },
    held: () => current,
  };
}

const NOW = new Date("2026-08-05T10:00:00.000Z");

function deps(overrides: Record<string, unknown> = {}) {
  return {
    hub: hub(),
    tickets: tickets(),
    now: () => NOW,
    machine: {
      deviceId: "device-abc",
      hostname: "workshop-01",
      architecture: "x86_64",
      operatingSystem: "linux",
      capabilities: ["docker"],
      labels: [],
    },
    announce: jest.fn(),
    sleep: jest.fn(async () => undefined),
    pollIntervalMs: 1000,
    maxAttempts: 5,
    ...overrides,
  };
}

describe("pairMachine", () => {
  it("returns the credential once an operator approves", async () => {
    const result = await pairMachine(deps());

    expect(result.isFailure).toBe(false);
    expect(result.value?.token).toBe("worker_c.s");
    expect(result.value?.actorId).toBe("a-1");
  });

  /**
   * The code is the whole out-of-band factor: an operator reads it off THIS
   * machine's console, which no amount of network access gives them. If it
   * scrolled past unnoticed the flow would silently become "approve whatever
   * is pending", which is not the same thing at all.
   */
  it("shows the code where a human cannot miss it", async () => {
    const d = deps();

    await pairMachine(d);

    const announced = (d.announce as jest.Mock).mock.calls.flat().join("\n");
    expect(announced).toContain("K7QM4T2X");
    expect(announced).toContain("workshop-01");
  });

  it("waits, and keeps waiting, while nobody has decided yet", async () => {
    const claimEnrolment = jest
      .fn()
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValue({ status: "approved", token: "worker_c.s", actorId: "a-1" });
    const d = deps({ hub: hub({ claimEnrolment }) });

    const result = await pairMachine(d);

    expect(result.isFailure).toBe(false);
    expect(claimEnrolment).toHaveBeenCalledTimes(3);
    expect(d.sleep).toHaveBeenCalledWith(1000);
  });

  /**
   * A pairing code expires, so waiting forever would leave a daemon polling a
   * request that can never be approved — busy, silent, and wrong. It stops
   * and says how to try again.
   */
  it("gives up when the code's window has closed, and says what to do", async () => {
    const d = deps({
      hub: hub({ claimEnrolment: async () => ({ status: "pending" }) }),
      maxAttempts: 3,
    });

    const result = await pairMachine(d);

    expect(result.isFailure).toBe(true);
    expect(result.error).toMatch(/expired|restart/i);
  });

  /**
   * The failure this was written for, observed on a real machine.
   *
   * The hub throttles its unauthenticated routes, and collecting a credential
   * is one of them. A human takes a minute to walk to the console and type
   * eight characters, so a worker WILL be refused while it waits — and it was
   * treating that refusal as fatal, exiting, and being restarted by systemd
   * into the same wall. Pairing could only succeed if somebody typed the code
   * within the first fifty seconds.
   */
  it("keeps waiting when the hub refuses a poll rather than dying on it", async () => {
    const claimEnrolment = jest
      .fn()
      .mockRejectedValueOnce(new Error("claiming the enrolment failed: 429 Too Many Requests"))
      .mockRejectedValueOnce(new Error("claiming the enrolment failed: 429 Too Many Requests"))
      .mockResolvedValue({ status: "approved", token: "worker_c.s", actorId: "a-1" });
    const d = deps({ hub: hub({ claimEnrolment }) });

    const result = await pairMachine(d);

    expect(result.isFailure).toBe(false);
    expect(claimEnrolment).toHaveBeenCalledTimes(3);
  });

  /**
   * Backing off, not merely retrying: polling at the same rate through a
   * refusal is what earned the refusal.
   */
  it("waits longer after being refused, and returns to normal once it is not", async () => {
    const claimEnrolment = jest
      .fn()
      .mockRejectedValueOnce(new Error("429"))
      .mockRejectedValueOnce(new Error("429"))
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValue({ status: "approved", token: "worker_c.s", actorId: "a-1" });
    const d = deps({ hub: hub({ claimEnrolment }) });

    await pairMachine(d);

    const waits = (d.sleep as jest.Mock).mock.calls.map((call) => call[0] as number);
    expect(waits[0]).toBeGreaterThan(1000);
    expect(waits[1]).toBeGreaterThan(waits[0] as number);
    // The refusal passed; the next wait is the ordinary one again.
    expect(waits[2]).toBe(1000);
  });

  /**
   * A hub that never answers is a different thing from one that is busy, and
   * a daemon that polled a dead address forever would look healthy while
   * doing nothing. It still gives up — it just does not give up on the first
   * refusal.
   */
  it("still gives up if the hub never stops refusing", async () => {
    const d = deps({
      hub: {
        requestEnrolment: async () => ({
          enrolmentId: "e-1",
          code: "CODE1234",
          expiresAt: new Date("2026-01-01T01:00:00.000Z").toISOString(),
        }),
        claimEnrolment: async () => {
          throw new Error("ECONNREFUSED");
        },
      },
      maxAttempts: 3,
    });

    const result = await pairMachine(d);

    expect(result.isFailure).toBe(true);
    expect(result.error).toMatch(/ECONNREFUSED/);
  });

  it("stops immediately when the request was rejected", async () => {
    const claimEnrolment = jest.fn().mockResolvedValue({ status: "rejected" });
    const d = deps({ hub: hub({ claimEnrolment }) });

    const result = await pairMachine(d);

    expect(result.isFailure).toBe(true);
    expect(result.error).toMatch(/refus|reject/i);
    // Rejected is a decision, not a delay: polling on would be nagging.
    expect(claimEnrolment).toHaveBeenCalledTimes(1);
  });

  it("reports a hub it cannot reach rather than throwing into the daemon", async () => {
    const d = deps({
      hub: hub({
        requestEnrolment: async () => {
          throw new Error("ECONNREFUSED");
        },
      }),
    });

    const result = await pairMachine(d);

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("declares the capabilities it will be approved for", async () => {
    const requestEnrolment = jest.fn().mockResolvedValue({
      enrolmentId: "e-1",
      code: "K7QM4T2X",
      expiresAt: "2026-08-05T10:10:00.000Z",
    });

    await pairMachine(deps({ hub: hub({ requestEnrolment }) }));

    expect(requestEnrolment).toHaveBeenCalledWith(
      expect.objectContaining({ capabilities: ["docker"], deviceId: "device-abc" }),
    );
  });
  /**
   * A machine that restarts — a crash, a reboot, a supervisor that gives up
   * and tries again — must come back to the SAME request.
   *
   * Asking again on every start turns one machine into hundreds of identical
   * pending requests, shows the operator a code that changes faster than they
   * can type it, and hammers the one route in the system that is deliberately
   * unauthenticated. Seen for real: 1957 restarts in a row, each one a new
   * enrolment, until the hub's throttle cut it off.
   */
  it("resumes the request it already has instead of asking for another", async () => {
    const requestEnrolment = jest.fn();
    const held = tickets({
      enrolmentId: "e-held",
      code: "K7QM4T2X",
      expiresAt: "2026-08-05T10:10:00.000Z",
    });
    const claimEnrolment = jest
      .fn()
      .mockResolvedValue({ status: "approved", token: "worker_c.s", actorId: "a-1" });
    const d = deps({ hub: hub({ requestEnrolment, claimEnrolment }), tickets: held });

    const result = await pairMachine(d);

    expect(result.isFailure).toBe(false);
    expect(requestEnrolment).not.toHaveBeenCalled();
    expect(claimEnrolment).toHaveBeenCalledWith("e-held", "device-abc");
  });

  it("keeps the request it opened, so the next start can resume it", async () => {
    const held = tickets();
    const d = deps({
      hub: hub({ claimEnrolment: async () => ({ status: "pending" }) }),
      tickets: held,
      maxAttempts: 2,
    });

    await pairMachine(d);

    expect(held.held()?.enrolmentId).toBe("e-1");
  });

  it("asks again once the code it was holding has expired", async () => {
    const requestEnrolment = jest.fn().mockResolvedValue({
      enrolmentId: "e-fresh",
      code: "NEWCODE1",
      expiresAt: "2026-08-05T10:10:00.000Z",
    });
    const stale = tickets({
      enrolmentId: "e-old",
      code: "OLDCODE1",
      // Ten minutes before `NOW`.
      expiresAt: "2026-08-05T09:50:00.000Z",
    });
    const d = deps({
      // Still waiting on a human, so the fresh request is still being held.
      hub: hub({ requestEnrolment, claimEnrolment: async () => ({ status: "pending" }) }),
      tickets: stale,
      maxAttempts: 1,
    });

    await pairMachine(d);

    expect(requestEnrolment).toHaveBeenCalledTimes(1);
    expect(stale.held()?.enrolmentId).toBe("e-fresh");
  });

  it("forgets the request once it has been decided, either way", async () => {
    const open = (): EnrolmentTicket => ({
      enrolmentId: "e-held",
      code: "K7QM4T2X",
      expiresAt: "2026-08-05T10:10:00.000Z",
    });

    const approved = tickets(open());
    await pairMachine(deps({ tickets: approved }));
    expect(approved.held()).toBeNull();

    const refused = tickets(open());
    await pairMachine(
      deps({
        hub: hub({ claimEnrolment: async () => ({ status: "rejected" }) }),
        tickets: refused,
      }),
    );
    expect(refused.held()).toBeNull();
  });
});
