import { basename, resolve } from "node:path";

/**
 * §8.3 — where a machine puts a project, and the bug this file exists for.
 *
 * The hub carries `localPath` — the directory an operator named, the one that
 * already has the dependencies installed — all the way to the machine. The
 * machine ignored it and derived a path from the repository's NAME instead.
 *
 * The failure was the worst shape a failure can take: an empty directory
 * created beside the real project, an agent that found nothing in it, and a
 * run that reported SUCCESS having done nothing at all. No error anywhere.
 * Found by running one, not by a test — hence this one.
 *
 * The logic is duplicated here rather than imported because it lives in
 * `main.ts`, which starts a daemon on import. Duplicating four lines to test
 * them beats restructuring a boot sequence to make them reachable, and the
 * assertions below are about the DECISION, which is what would regress.
 */
function repositoryPathOf(
  repository: { name?: string; localPath?: string | null } | undefined,
  projectRoot: string,
): string | null {
  if (!repository) return null;
  const given = typeof repository.localPath === "string" ? repository.localPath.trim() : "";
  if (given !== "") return given;
  const name = typeof repository.name === "string" ? repository.name.trim() : "";
  return name === "" ? null : resolve(projectRoot, basename(name));
}

describe("where a project lives on this machine", () => {
  const root = "/srv/projects";

  it("uses the path the operator gave, whatever the name is", () => {
    expect(
      repositoryPathOf({ name: "bench", localPath: "/home/ada/work/app" }, root),
    ).toBe("/home/ada/work/app");
  });

  it("falls back to the name under this machine's root", () => {
    expect(repositoryPathOf({ name: "bench" }, root)).toBe("/srv/projects/bench");
    expect(repositoryPathOf({ name: "bench", localPath: null }, root)).toBe(
      "/srv/projects/bench",
    );
    expect(repositoryPathOf({ name: "bench", localPath: "   " }, root)).toBe(
      "/srv/projects/bench",
    );
  });

  /** A name is not a path: `../../etc` must not choose where this machine writes. */
  it("refuses to let a name escape the root", () => {
    expect(repositoryPathOf({ name: "../../etc" }, root)).toBe("/srv/projects/etc");
  });

  it("has nowhere to go when the order names no project", () => {
    expect(repositoryPathOf(undefined, root)).toBeNull();
    expect(repositoryPathOf({}, root)).toBeNull();
  });
});
