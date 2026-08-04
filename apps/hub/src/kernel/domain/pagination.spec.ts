import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, pageSize } from "./pagination";

describe("pageSize", () => {
  /** The defect this exists to prevent: absent meant "everything". */
  it("gives a page when nothing was asked for", () => {
    expect(pageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("honours what was asked for, within the ceiling", () => {
    expect(pageSize(10)).toBe(10);
    expect(pageSize(MAX_PAGE_SIZE + 1000)).toBe(MAX_PAGE_SIZE);
  });

  it("treats nonsense as absent rather than as zero", () => {
    // A zero-sized page is an empty answer that looks like an empty table.
    expect(pageSize(0)).toBe(DEFAULT_PAGE_SIZE);
    expect(pageSize(-5)).toBe(DEFAULT_PAGE_SIZE);
    expect(pageSize(Number.NaN)).toBe(DEFAULT_PAGE_SIZE);
    expect(pageSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("floors a fractional request instead of passing it to the driver", () => {
    expect(pageSize(10.7)).toBe(10);
  });

  it("lets a module tighten both bounds, never loosen the ceiling silently", () => {
    expect(pageSize(undefined, { fallback: 25 })).toBe(25);
    expect(pageSize(1000, { ceiling: 50 })).toBe(50);
    // A fallback above its own ceiling still respects the ceiling.
    expect(pageSize(undefined, { fallback: 900, ceiling: 50 })).toBe(50);
  });
});
