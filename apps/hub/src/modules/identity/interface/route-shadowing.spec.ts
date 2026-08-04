import { globSync, readFileSync } from "node:fs";

/**
 * A parametric route declared before a static sibling swallows it: Nest
 * matches in declaration order, so `@Get(":id")` placed above `@Get("verify")`
 * turns `/verify` into a lookup for an entry called "verify".
 *
 * This is silent — nothing fails to compile, no guard complains, and the
 * shadowed route simply starts answering 404. It happened while adding a
 * single-read route to the audit controller, and only one e2e assertion
 * noticed. Checked here so the next one is caught at the source.
 */
interface Declared {
  verb: string;
  segment: string;
  order: number;
}

function routesOf(source: string): Declared[] {
  const routes: Declared[] = [];
  const pattern = /@(Get|Post|Patch|Put|Delete)\("?([^")]*)"?\)/g;
  let match: RegExpExecArray | null;
  let order = 0;
  while ((match = pattern.exec(source)) !== null) {
    routes.push({ verb: match[1]!, segment: match[2] ?? "", order: order++ });
  }
  return routes;
}

/** How many leading segments a path has before its first parameter. */
function shape(path: string): { prefix: string; parametric: boolean } {
  const parts = path.split("/").filter(Boolean);
  const index = parts.findIndex((part) => part.startsWith(":"));
  return {
    prefix: (index === -1 ? parts : parts.slice(0, index)).join("/"),
    parametric: index !== -1,
  };
}

describe("no route is shadowed by an earlier parametric sibling", () => {
  const controllers = globSync("src/**/*.controller.ts");

  it("finds the controllers it is meant to check", () => {
    expect(controllers.length).toBeGreaterThan(10);
  });

  it.each(controllers)("%s declares static paths before parametric ones", (file) => {
    const routes = routesOf(readFileSync(file, "utf8"));
    const shadowed: string[] = [];

    for (const candidate of routes) {
      const own = shape(candidate.segment);
      if (own.parametric) {
        continue;
      }
      for (const earlier of routes) {
        if (earlier.order >= candidate.order || earlier.verb !== candidate.verb) {
          continue;
        }
        const other = shape(earlier.segment);
        // Same verb, same prefix, and the earlier one takes a parameter
        // exactly where this one has a literal: the literal never matches.
        if (other.parametric && other.prefix === own.prefix) {
          const earlierDepth = earlier.segment.split("/").filter(Boolean).length;
          const ownDepth = candidate.segment.split("/").filter(Boolean).length;
          if (earlierDepth === ownDepth) {
            shadowed.push(
              `${candidate.verb} "${candidate.segment}" is swallowed by "${earlier.segment}"`,
            );
          }
        }
      }
    }

    expect(shadowed).toEqual([]);
  });
});
