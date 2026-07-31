import { wouldCreateCycle } from "./dependency-graph";

interface FakeNode {
  id: string;
  dependencies: readonly string[];
}

function node(id: string, dependencies: string[] = []): FakeNode {
  return { id, dependencies };
}

describe("wouldCreateCycle", () => {
  it("is false when there are no dependencies at all", () => {
    expect(wouldCreateCycle("a", [], new Map())).toBe(false);
  });

  it("is false for an unrelated dependency chain", () => {
    const b = node("b");
    expect(wouldCreateCycle("a", ["b"], new Map([["b", b]]))).toBe(false);
  });

  it("is true when the candidate dependency directly depends back on this node", () => {
    const a = node("a");
    const b = node("b", ["a"]);
    const byId = new Map([
      ["a", a],
      ["b", b],
    ]);

    expect(wouldCreateCycle("a", ["b"], byId)).toBe(true);
  });

  it("is true for a transitive cycle (a -> b -> c -> a)", () => {
    const a = node("a");
    const c = node("c", ["a"]);
    const b = node("b", ["c"]);
    const byId = new Map([
      ["a", a],
      ["b", b],
      ["c", c],
    ]);

    expect(wouldCreateCycle("a", ["b"], byId)).toBe(true);
  });
});
