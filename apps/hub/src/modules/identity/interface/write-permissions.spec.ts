import { globSync, readFileSync } from "node:fs";

/**
 * A structural invariant, not an example.
 *
 * The permission matrix says a VIEWER only reads and a READ_ONLY_AGENT only
 * reads and records decisions. That is true of the matrix — and it was false
 * of the system, because two routes that WRITE were guarded by
 * `read_workspace_state`: writing a memory note and sending a notification.
 * Both roles are named for reading, and both could write.
 *
 * A matrix test cannot catch that: the mistake is at the route. So the rule
 * is checked where it lives — no mutating route may be guarded by a read
 * permission.
 *
 * The exemptions are a **named list with reasons**, never a blanket
 * disabling: §18.8 asks for exactly that shape when a generic check has to be
 * bypassed. Each entry below is a POST that declares something about the
 * caller themselves rather than changing the workspace.
 */
const DECLARATIONS_ABOUT_ONESELF = new Set([
  // Acknowledging a fact addressed to you (§14.4) — taking notice is not a
  // change to anyone else's world, and forbidding it to a reader would make
  // the receipt mechanism useless for the actors it exists for.
  "POST workspaces/:workspaceId/events/:eventId/receipts/mine",
  // Same, for a notification addressed to you (§4.19).
  "POST workspaces/:workspaceId/notifications/:notificationId/mine",
]);

const READ_PERMISSIONS = new Set(["read_workspace_state"]);

interface Route {
  verb: string;
  path: string;
  permission: string | null;
  file: string;
}

function routesOf(file: string): Route[] {
  const source = readFileSync(file, "utf8");
  const base = /@Controller\("([^"]*)"\)/.exec(source)?.[1] ?? "";
  const routes: Route[] = [];
  const pattern =
    /@(Get|Post|Patch|Put|Delete)\("?([^")]*)"?\)((?:.|\n)*?)async \w+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const [, verb, path, between] = match;
    routes.push({
      verb: verb!,
      path: [base, path].filter(Boolean).join("/"),
      permission: /@RequirePermission\("([^"]+)"\)/.exec(between!)?.[1] ?? null,
      file,
    });
  }
  return routes;
}

describe("write routes never rest on a read permission", () => {
  const controllers = globSync("src/**/*.controller.ts");

  it("finds the controllers it is meant to check", () => {
    // Guards the guard: a broken glob would make this suite pass by finding
    // nothing at all, which reads exactly like success.
    expect(controllers.length).toBeGreaterThan(10);
  });

  it("no POST, PATCH, PUT or DELETE is guarded by a read permission", () => {
    const offenders = controllers
      .flatMap(routesOf)
      .filter((route) => route.verb !== "Get")
      .filter((route) => route.permission !== null)
      .filter((route) => READ_PERMISSIONS.has(route.permission!))
      .map((route) => `${route.verb.toUpperCase()} ${route.path}`)
      .filter((signature) => !DECLARATIONS_ABOUT_ONESELF.has(signature));

    expect(offenders).toEqual([]);
  });

  it("every exemption still exists, so the list cannot rot", () => {
    const all = new Set(
      controllers
        .flatMap(routesOf)
        .map((route) => `${route.verb.toUpperCase()} ${route.path}`),
    );

    for (const exempted of DECLARATIONS_ABOUT_ONESELF) {
      expect(all.has(exempted)).toBe(true);
    }
  });
});
