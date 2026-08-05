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
 * **This checks per CONTROLLER, not per file**, and the difference is not
 * theoretical: it was written per file, and the first file to hold two
 * controllers — one deliberately open, one guarded — made it pass while an
 * unguarded controller sat right there. An invariant that can be satisfied by
 * a neighbour is worse than none, because it reads as proof.
 */
const OPEN_BY_DESIGN = new Map([
  [
    "HealthController",
    "Liveness. A probe has no credential, and refusing it would make the hub " +
      "look dead to whatever restarts it. It returns a fixed { status: 'ok' } " +
      "and no workspace data (§17).",
  ],
  [
    "AuthController",
    "The door itself: /auth/register and /auth/login are what a stranger " +
      "calls to stop being one, and a door that needs a key to knock on is " +
      "not a door. Both are rate-limited (§18). /auth/me, which does need a " +
      "caller, carries its own @UseGuards — which is exactly why this check " +
      "reads the class header and not the whole file.",
  ],
  [
    "EnrolmentDoorController",
    "§6.3 — a machine asking to be paired has nothing to authenticate with " +
      "yet; that is what pairing is for. Asking grants nothing: it creates a " +
      "PENDING record, a human must approve it using a code printed on that " +
      "machine's console, the claim requires the deviceId the machine kept, " +
      "and both routes are rate-limited like a login.",
  ],
]);

interface ControllerDeclaration {
  name: string;
  file: string;
  guarded: boolean;
}

/**
 * Splits a source file at each `@Controller(...)` so a guard on one class can
 * never be credited to another.
 */
function controllersOf(file: string): ControllerDeclaration[] {
  const source = readFileSync(file, "utf8");
  const starts = [...source.matchAll(/@Controller\(/g)].map((match) => match.index);
  return starts.map((start, at) => {
    const block = source.slice(start, starts[at + 1] ?? source.length);
    const name = /export class (\w+)/.exec(block)?.[1] ?? `<unnamed in ${file}>`;
    // Only what sits between the decorator and the class body: a @UseGuards
    // on a method guards that method, not the controller.
    const header = block.slice(0, block.indexOf("export class"));
    return { name, file, guarded: header.includes("@UseGuards(") };
  });
}

describe("every controller authenticates its caller", () => {
  const controllers = globSync("src/**/*.controller.ts").flatMap(controllersOf);

  it("finds the controllers it is meant to check", () => {
    // Guards the guard: a broken glob would find nothing, which reads
    // exactly like success.
    expect(controllers.length).toBeGreaterThan(10);
  });

  it("no controller is reachable without a guard", () => {
    const unguarded = controllers
      .filter((controller) => !controller.guarded)
      .map((controller) => controller.name)
      .filter((name) => !OPEN_BY_DESIGN.has(name));

    expect(unguarded).toEqual([]);
  });

  it("every exception still exists, so the list cannot rot", () => {
    const declared = controllers.map((controller) => controller.name);

    for (const exempted of OPEN_BY_DESIGN.keys()) {
      expect(declared).toContain(exempted);
    }
  });

  /**
   * The exemptions are the dangerous entries, so they are the ones that must
   * stay deliberate: an open controller with no written reason is an open
   * controller nobody decided on.
   */
  it("every exception carries a reason", () => {
    for (const [name, reason] of OPEN_BY_DESIGN) {
      expect(reason.length).toBeGreaterThan(40);
      expect(name).not.toBe("");
    }
  });
});
