import { globSync, readFileSync } from "node:fs";

/**
 * A structural invariant, in the shape §18.8 asks for: a generic rule checked
 * where it can actually be broken, with a named exception list rather than a
 * blanket exemption.
 *
 * The rule: every controller authenticates. Authorisation differs per route —
 * some need a workspace permission, some only need a known caller — but a
 * controller that mentions no guard at all is open to the internet, and that
 * is not something a code review reliably notices: the omission looks like
 * nothing.
 *
 * Two routes inside guarded controllers are deliberately anonymous
 * (/auth/register, /auth/login); they are the door, and a door that requires
 * a key to knock on is not a door. Both are rate-limited instead (§18).
 */
const OPEN_BY_DESIGN = new Map([
  [
    "src/health/health.controller.ts",
    "Liveness. A probe has no credential, and refusing it would make the " +
      "hub look dead to whatever restarts it. It reveals nothing: a fixed " +
      "{ status: 'ok' } and no workspace data (§17).",
  ],
]);

describe("every controller authenticates its caller", () => {
  const controllers = globSync("src/**/*.controller.ts");

  it("finds the controllers it is meant to check", () => {
    // Guards the guard: a broken glob would find nothing, which reads
    // exactly like success.
    expect(controllers.length).toBeGreaterThan(10);
  });

  it("no controller is reachable without a guard", () => {
    const unguarded = controllers.filter(
      (file) => !readFileSync(file, "utf8").includes("@UseGuards("),
    );

    expect(unguarded.filter((file) => !OPEN_BY_DESIGN.has(file))).toEqual([]);
  });

  it("every exception still exists, so the list cannot rot", () => {
    for (const exempted of OPEN_BY_DESIGN.keys()) {
      expect(controllers).toContain(exempted);
    }
  });
});
