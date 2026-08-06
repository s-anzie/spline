import { Repository } from "./repository";

/**
 * §8.3 — a project needs somewhere to come FROM or somewhere to BE, and one
 * of the two is enough.
 *
 * An address alone: every machine clones it, and they work in parallel. A
 * path alone: the project lives on one machine and nowhere else, so every
 * agent working on it has to be on that machine — a real situation (a project
 * nobody has pushed yet), not a defect. Neither is nothing, and refusing that
 * is the whole guard.
 */
describe("Repository.register", () => {
  const base = {
    workspaceId: "w-1",
    name: "spline",
    now: new Date("2026-08-06T12:00:00.000Z"),
  };

  it("takes a project that says only where it lives", () => {
    const registered = Repository.register({
      ...base,
      localPath: "/home/ada/projects/spline",
    });

    expect(registered.isSuccess).toBe(true);
    expect(registered.value.origin).toBe("");
    expect(registered.value.localPath).toBe("/home/ada/projects/spline");
  });

  it("takes one that says only where it comes from", () => {
    const registered = Repository.register({
      ...base,
      origin: "git@example.com:acme/app.git",
    });

    expect(registered.isSuccess).toBe(true);
    expect(registered.value.localPath).toBeNull();
  });

  it("takes both, which is the ordinary case", () => {
    const registered = Repository.register({
      ...base,
      origin: "git@example.com:acme/app.git",
      localPath: "/home/ada/projects/spline",
    });

    expect(registered.isSuccess).toBe(true);
  });

  it("refuses neither, and says what would have worked", () => {
    const refused = Repository.register(base);

    expect(refused.isFailure).toBe(true);
    expect(refused.error.message).toMatch(/address|path/i);
  });

  it("refuses two blanks, which is neither wearing a disguise", () => {
    expect(
      Repository.register({ ...base, origin: "  ", localPath: " " }).isFailure,
    ).toBe(true);
  });

  /** §8.11 — the default branch is protected whether or not anybody said so. */
  it("protects its default branch without being asked", () => {
    const registered = Repository.register({
      ...base,
      origin: "git@example.com:acme/app.git",
      defaultBranch: "trunk",
    });

    expect(registered.value.protectedBranches).toContain("trunk");
  });
});
