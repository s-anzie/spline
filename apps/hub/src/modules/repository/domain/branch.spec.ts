import { Branch, branchNameFor, DEFAULT_PROTECTED_BRANCHES } from "./branch";

const now = new Date("2026-08-04T10:00:00Z");

describe("branchNameFor", () => {
  /**
   * §8.3 gives three shapes. The name is DERIVED, never supplied: a free
   * string would let someone create `main` by accident, and the rule would
   * have to be re-checked at every call site instead of being the only way
   * to obtain a name at all.
   */
  it("derives the three shapes of §8.3", () => {
    expect(branchNameFor({ kind: "TASK", id: "t-1" })).toBe("task/t-1");
    expect(branchNameFor({ kind: "GOAL", id: "g-1" })).toBe("goal/g-1");
    expect(branchNameFor({ kind: "AGENT", id: "s-1" })).toBe("agent/s-1");
  });

  it("cannot be made to produce a protected name", () => {
    for (const protectedName of DEFAULT_PROTECTED_BRANCHES) {
      expect(branchNameFor({ kind: "TASK", id: protectedName })).toBe(
        `task/${protectedName}`,
      );
    }
  });
});

describe("Branch", () => {
  function open(overrides: Record<string, unknown> = {}) {
    return Branch.open({
      repositoryId: "r-1",
      kind: "TASK",
      sourceId: "t-1",
      taskId: "t-1",
      protectedBranches: DEFAULT_PROTECTED_BRANCHES,
      now,
      ...overrides,
    });
  }

  it("opens a branch whose name follows from what it is for", () => {
    const result = open();

    expect(result.isSuccess).toBe(true);
    expect(result.value.name).toBe("task/t-1");
    expect(result.value.kind).toBe("TASK");
    expect(result.value.taskId).toBe("t-1");
  });

  it("refuses a branch with no repository or no subject", () => {
    expect(open({ repositoryId: " " }).isFailure).toBe(true);
    expect(open({ sourceId: "" }).isFailure).toBe(true);
  });

  /** §8.3 — "aucune tâche ne travaille directement sur main, master, develop". */
  it("refuses to hand a task a protected branch", () => {
    const result = Branch.adopt({
      repositoryId: "r-1",
      name: "main",
      kind: "TASK",
      taskId: "t-1",
      protectedBranches: DEFAULT_PROTECTED_BRANCHES,
      now,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("ProtectedBranchError");
  });

  it("still lets a repository record its protected branches as such", () => {
    const main = Branch.adopt({
      repositoryId: "r-1",
      name: "main",
      kind: "PROTECTED",
      protectedBranches: DEFAULT_PROTECTED_BRANCHES,
      now,
    });

    expect(main.isSuccess).toBe(true);
    expect(main.value.kind).toBe("PROTECTED");
  });

  it("honours protections a workspace added on top of the defaults", () => {
    const result = Branch.adopt({
      repositoryId: "r-1",
      name: "release",
      kind: "TASK",
      taskId: "t-1",
      protectedBranches: [...DEFAULT_PROTECTED_BRANCHES, "release"],
      now,
    });

    expect(result.isFailure).toBe(true);
  });

  it("is closed once, and stops being open for work", () => {
    const branch = open().value;

    expect(branch.close(now).isSuccess).toBe(true);
    expect(branch.status).toBe("CLOSED");
    // Idempotent: closing twice is not an error.
    expect(branch.close(now).isSuccess).toBe(true);
  });

  it("raises a fact the journal can read", () => {
    const branch = open().value;

    expect(branch.domainEvents[0]?.eventName).toBe("repository.branch_created");
  });
});
