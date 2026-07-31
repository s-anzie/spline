import { resolveCwdWithinRoot } from "./resolve-cwd-within-root";

describe("resolveCwdWithinRoot", () => {
  it("resolves a relative cwd within the root", () => {
    expect(resolveCwdWithinRoot("/home/bradley/spline", "apps/web")).toBe(
      "/home/bradley/spline/apps/web",
    );
  });

  it("resolves the root itself", () => {
    expect(resolveCwdWithinRoot("/home/bradley/spline", ".")).toBe("/home/bradley/spline");
  });

  it("resolves an absolute cwd that is within the root", () => {
    expect(resolveCwdWithinRoot("/home/bradley/spline", "/home/bradley/spline/apps/api")).toBe(
      "/home/bradley/spline/apps/api",
    );
  });

  it("rejects a relative traversal escaping the root", () => {
    expect(resolveCwdWithinRoot("/home/bradley/spline", "../etc")).toBeNull();
  });

  it("rejects a nested traversal escaping the root", () => {
    expect(resolveCwdWithinRoot("/home/bradley/spline", "apps/../../etc/passwd")).toBeNull();
  });

  it("rejects an absolute cwd outside the root", () => {
    expect(resolveCwdWithinRoot("/home/bradley/spline", "/etc/passwd")).toBeNull();
  });

  it("rejects a sibling directory that merely shares a name prefix", () => {
    expect(resolveCwdWithinRoot("/home/bradley/spline", "/home/bradley/spline-evil")).toBeNull();
  });
});
