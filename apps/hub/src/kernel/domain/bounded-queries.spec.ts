import { globSync, readFileSync } from "node:fs";

/**
 * No list query returns a whole table.
 *
 * An audit found the page-cap convention present in three modules and absent
 * from eight: eleven list endpoints answered with everything they had. It is
 * invisible while the tables are small and a wall once they are not, and a
 * caller cannot even tell it is being handed more than it asked for.
 *
 * Checked structurally rather than left to review, with a **named exception
 * list** — the shape §18.8 asks for when a generic check must be bypassed.
 */
const DELIBERATELY_UNBOUNDED = new Map([
  [
    "listChain",
    "audit — a signature chain verified over a page is a chain verified over " +
      "a page; capping it would let verification answer 'intact' about a " +
      "fragment, and a detection mechanism that lies by omission is worse " +
      "than none (audit/doc.md §1.6).",
  ],
]);

interface Query {
  file: string;
  line: number;
  method: string;
  bounded: boolean;
}

function queriesOf(file: string): Query[] {
  const source = readFileSync(file, "utf8");
  const found: Query[] = [];
  const pattern = /\.findMany\(\{/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    let depth = 0;
    let end = match.index;
    for (let i = match.index + match[0].length - 1; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const before = source.slice(0, match.index);
    const method = [...before.matchAll(/async (\w+)\(/g)].at(-1)?.[1] ?? "?";
    found.push({
      file,
      line: before.split("\n").length,
      method,
      bounded: source.slice(match.index, end).includes("take:"),
    });
  }
  return found;
}

describe("every list query is bounded", () => {
  const repositories = globSync("src/**/infrastructure/prisma-*.repository.ts");

  it("finds the repositories it is meant to check", () => {
    // A broken glob would make this suite pass by checking nothing, which
    // reads exactly like success.
    expect(repositories.length).toBeGreaterThan(8);
  });

  it("no findMany answers with a whole table", () => {
    const unbounded = repositories
      .flatMap(queriesOf)
      .filter((query) => !query.bounded)
      .filter((query) => !DELIBERATELY_UNBOUNDED.has(query.method))
      .map((query) => `${query.file}:${query.line} (${query.method})`);

    expect(unbounded).toEqual([]);
  });

  it("every exception still exists, so the list cannot rot", () => {
    const methods = new Set(repositories.flatMap(queriesOf).map((q) => q.method));

    for (const exempted of DELIBERATELY_UNBOUNDED.keys()) {
      expect(methods.has(exempted)).toBe(true);
    }
  });
});
