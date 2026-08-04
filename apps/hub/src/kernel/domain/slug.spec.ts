import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and replaces separators with single dashes", () => {
    expect(slugify("Bradley's Space")).toBe("bradley-s-space");
    expect(slugify("Spline Core")).toBe("spline-core");
  });

  it("collapses consecutive separators and trims edge dashes", () => {
    expect(slugify("  A  --  B!  ")).toBe("a-b");
  });

  it("returns an empty string when nothing survives", () => {
    expect(slugify("###")).toBe("");
  });
});
