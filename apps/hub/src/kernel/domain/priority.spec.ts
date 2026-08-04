import { comparePriority, DEFAULT_PRIORITY, PRIORITIES } from "./priority";

describe("priority (§9.7)", () => {
  it("exposes the five system levels, NORMAL by default", () => {
    expect(PRIORITIES).toEqual(["CRITICAL", "HIGH", "NORMAL", "LOW", "BACKGROUND"]);
    expect(DEFAULT_PRIORITY).toBe("NORMAL");
  });

  it("comparePriority sorts most-urgent first", () => {
    const sorted = ["LOW", "CRITICAL", "BACKGROUND", "NORMAL", "HIGH"] as const;

    expect([...sorted].sort(comparePriority)).toEqual([
      "CRITICAL",
      "HIGH",
      "NORMAL",
      "LOW",
      "BACKGROUND",
    ]);
  });
});
