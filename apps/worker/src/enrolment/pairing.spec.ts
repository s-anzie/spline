import { PairingHub, pairMachine } from "./pairing";

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

function deps(overrides: Record<string, unknown> = {}) {
  return {
    hub: hub(),
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
});
