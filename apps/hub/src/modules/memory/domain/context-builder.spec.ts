import { ActorRef } from "../../identity/domain/actor";
import { buildContext, PER_SCOPE_LIMIT } from "./context-builder";
import { MemoryEntry, MemoryScopeType } from "./memory-entry";

const now = new Date("2026-08-04T10:00:00Z");
const author = ActorRef.create("HUMAN", "u-1").value;

function at(scopeType: MemoryScopeType, scopeId: string, title: string) {
  return MemoryEntry.remember({
    workspaceId: "w-1",
    scopeType,
    scopeId,
    type: "note",
    title,
    content: title,
    author,
    now,
  }).value;
}

const context = {
  organizationId: "org-1",
  workspaceId: "w-1",
  goalId: "g-1",
  taskId: "t-1",
};

describe("buildContext", () => {
  /**
   * The opposite of policy resolution (§12.2), and the distinction matters:
   * a task-level policy REPLACES the workspace's, a task-level note is ADDED
   * to it. Read from general to specific, the way someone would tell it.
   */
  it("stacks every level instead of letting the most specific win", () => {
    const built = buildContext(
      [
        at("TASK", "t-1", "check the staging credentials"),
        at("ORGANIZATION", "org-1", "we deploy on Fridays"),
        at("WORKSPACE", "w-1", "branch naming"),
        at("GOAL", "g-1", "the migration must be reversible"),
      ],
      context,
    );

    expect(built.levels.map((level) => level.scopeType)).toEqual([
      "ORGANIZATION",
      "WORKSPACE",
      "GOAL",
      "TASK",
    ]);
    expect(built.levels.flatMap((level) => level.entries)).toHaveLength(4);
  });

  it("skips a level absent from the context rather than failing", () => {
    const built = buildContext(
      [at("WORKSPACE", "w-1", "conventions"), at("REPOSITORY", "repo-1", "git rules")],
      context,
    );

    expect(built.levels.map((level) => level.scopeType)).toEqual(["WORKSPACE"]);

    // §16.4 — repository memory exists "uniquement si le Repository Engine est
    // utilisé". Skipping it is the normal case, never an error (§12.2's twin).
    const withRepo = buildContext(
      [at("WORKSPACE", "w-1", "conventions"), at("REPOSITORY", "repo-1", "git rules")],
      { ...context, repositoryId: "repo-1" },
    );
    expect(withRepo.levels.map((level) => level.scopeType)).toEqual([
      "WORKSPACE",
      "REPOSITORY",
    ]);
  });

  it("ignores an entry of the right level but the wrong identifier", () => {
    const built = buildContext(
      [at("TASK", "t-1", "mine"), at("TASK", "another", "someone else's")],
      context,
    );

    expect(built.levels.flatMap((level) => level.entries)).toHaveLength(1);
  });

  it("leaves superseded and forgotten entries out", () => {
    const superseded = at("WORKSPACE", "w-1", "old convention");
    superseded.supersedeBy("m-2", now);
    const forgotten = at("WORKSPACE", "w-1", "a mistake");
    forgotten.forget(now);

    const built = buildContext(
      [superseded, forgotten, at("WORKSPACE", "w-1", "current convention")],
      context,
    );

    expect(built.levels[0]?.entries.map((e) => e.title)).toEqual([
      "current convention",
    ]);
  });

  /**
   * An agent loading its context must not be handed a thousand notes, and a
   * silent cut would read as "that is all there is" (§17.8).
   */
  it("caps each level and says what it left out", () => {
    const many = Array.from({ length: PER_SCOPE_LIMIT + 5 }, (_, i) =>
      at("WORKSPACE", "w-1", `note ${i}`),
    );

    const built = buildContext(many, context);

    expect(built.levels[0]?.entries).toHaveLength(PER_SCOPE_LIMIT);
    expect(built.levels[0]?.truncated).toBe(true);
    expect(built.levels[0]?.total).toBe(PER_SCOPE_LIMIT + 5);
  });

  it("says nothing was truncated when nothing was", () => {
    const built = buildContext([at("WORKSPACE", "w-1", "one note")], context);

    expect(built.levels[0]?.truncated).toBe(false);
    expect(built.levels[0]?.total).toBe(1);
  });

  it("returns an empty context rather than failing when there is nothing", () => {
    expect(buildContext([], context).levels).toEqual([]);
  });
});
