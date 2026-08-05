import { preflightComplaints } from "./preflight";

describe("preflightComplaints", () => {
  it("says nothing when the machine is set up correctly", () => {
    expect(
      preflightComplaints({
        uid: 1000,
        statMode: () => 0o600,
        secretFiles: [".env"],
      }),
    ).toEqual([]);
  });

  /**
   * The check that makes the others mean something: none of the containment
   * in `planSpawn` survives a process that can write anywhere anyway.
   */
  it("refuses to be satisfied when running as root", () => {
    const complaints = preflightComplaints({ uid: 0, secretFiles: [] });

    expect(complaints).toHaveLength(1);
    expect(complaints[0]).toContain("root");
  });

  it("names a token file the rest of the machine can read", () => {
    const complaints = preflightComplaints({
      uid: 1000,
      statMode: () => 0o644,
      secretFiles: ["/etc/spline/worker.env"],
    });

    expect(complaints).toHaveLength(1);
    expect(complaints[0]).toContain("/etc/spline/worker.env");
    // The complaint carries the fix, not just the diagnosis (§17.8).
    expect(complaints[0]).toContain("chmod 600");
  });

  it.each([0o640, 0o604, 0o777])("complains about mode %s", (mode) => {
    expect(
      preflightComplaints({ uid: 1000, statMode: () => mode, secretFiles: [".env"] }),
    ).toHaveLength(1);
  });

  it("says nothing about a file that is not there", () => {
    expect(
      preflightComplaints({
        uid: 1000,
        statMode: () => {
          throw new Error("ENOENT");
        },
        secretFiles: [".env"],
      }),
    ).toEqual([]);
  });

  /** Every complaint at once, so a misconfigured machine learns it in one run. */
  it("reports everything wrong rather than the first thing", () => {
    expect(
      preflightComplaints({
        uid: 0,
        statMode: () => 0o666,
        secretFiles: ["a.env", "b.env"],
      }),
    ).toHaveLength(3);
  });

  it("skips the file check where there is no way to stat", () => {
    expect(preflightComplaints({ uid: 1000, secretFiles: [".env"] })).toEqual([]);
  });
});
