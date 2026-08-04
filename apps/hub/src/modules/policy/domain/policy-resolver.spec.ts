import { ActorRef } from "../../identity/domain/actor";
import { Policy } from "./policy";
import { resolveEffectivePolicies } from "./policy-resolver";

const now = new Date("2026-08-04T10:00:00Z");
const author = ActorRef.create("HUMAN", "u-1").value;

function policy(
  scopeType: "ORGANIZATION" | "WORKSPACE" | "REPOSITORY" | "GOAL" | "TASK",
  scopeId: string,
  rule: string,
  value: unknown,
) {
  return Policy.set({
    workspaceId: "w-1",
    scopeType,
    scopeId,
    type: "RUNTIME",
    rule,
    value,
    createdBy: author,
    now,
  }).value;
}

const context = {
  organizationId: "org-1",
  workspaceId: "w-1",
  goalId: "g-1",
  taskId: "t-1",
  repositoryId: undefined,
};

describe("resolveEffectivePolicies", () => {
  it("returns nothing when nothing is declared", () => {
    expect(resolveEffectivePolicies([], context).size).toBe(0);
  });

  /** §12.2 — "une politique plus spécifique surcharge une politique plus générale". */
  it("lets the most specific scope win, and says which one decided", () => {
    const resolved = resolveEffectivePolicies(
      [
        policy("ORGANIZATION", "org-1", "timeout", 3600),
        policy("WORKSPACE", "w-1", "timeout", 600),
        policy("TASK", "t-1", "timeout", 60),
      ],
      context,
    );

    const timeout = resolved.get("timeout");
    expect(timeout?.value).toBe(60);
    // §17.8 — a resolved state is never reported without what produced it.
    expect(timeout?.decidedBy.scopeType).toBe("TASK");
  });

  it("follows the full precedence, level by level", () => {
    const levels = [
      ["TASK", "t-1"],
      ["GOAL", "g-1"],
      ["WORKSPACE", "w-1"],
      ["ORGANIZATION", "org-1"],
    ] as const;

    // Removing the most specific each time must promote exactly the next one.
    for (let i = 0; i < levels.length; i++) {
      const declared = levels
        .slice(i)
        .map(([scopeType, scopeId]) => policy(scopeType, scopeId, "timeout", i));
      const resolved = resolveEffectivePolicies(declared, context);
      expect(resolved.get("timeout")?.decidedBy.scopeType).toBe(levels[i]?.[0]);
    }
  });

  /**
   * §12.2, textually: the Repository step is conditional, and skipping it "is
   * never an error state, it is the normal case for any work outside the
   * software domain". The product vision (§1) reaching down into the
   * resolution algorithm.
   */
  it("skips the repository level when the task uses no repository", () => {
    const declared = [
      policy("WORKSPACE", "w-1", "timeout", 600),
      policy("REPOSITORY", "repo-1", "timeout", 120),
    ];

    const without = resolveEffectivePolicies(declared, context);
    expect(without.get("timeout")?.value).toBe(600);

    const with_ = resolveEffectivePolicies(declared, {
      ...context,
      repositoryId: "repo-1",
    });
    expect(with_.get("timeout")?.value).toBe(120);
  });

  it("ignores a scope of the right type but the wrong identifier", () => {
    const resolved = resolveEffectivePolicies(
      [
        policy("WORKSPACE", "w-1", "timeout", 600),
        policy("TASK", "another-task", "timeout", 1),
      ],
      context,
    );

    expect(resolved.get("timeout")?.value).toBe(600);
  });

  /**
   * Rule by rule, never block by block: a task overriding one rule must not
   * silently erase everything the workspace set.
   */
  it("overrides one rule without dropping the others", () => {
    const resolved = resolveEffectivePolicies(
      [
        policy("WORKSPACE", "w-1", "timeout", 600),
        policy("WORKSPACE", "w-1", "max_memory", "2Gi"),
        policy("TASK", "t-1", "timeout", 60),
      ],
      context,
    );

    expect(resolved.get("timeout")?.value).toBe(60);
    expect(resolved.get("max_memory")?.value).toBe("2Gi");
    expect(resolved.size).toBe(2);
  });

  it("leaves a disabled policy out of the resolution entirely", () => {
    const disabled = policy("TASK", "t-1", "timeout", 60);
    disabled.disable(now);

    const resolved = resolveEffectivePolicies(
      [policy("WORKSPACE", "w-1", "timeout", 600), disabled],
      context,
    );

    expect(resolved.get("timeout")?.value).toBe(600);
  });

  it("resolves for a context that has no goal and no task", () => {
    const resolved = resolveEffectivePolicies(
      [
        policy("ORGANIZATION", "org-1", "timeout", 3600),
        policy("WORKSPACE", "w-1", "timeout", 600),
        policy("TASK", "t-1", "timeout", 60),
      ],
      { organizationId: "org-1", workspaceId: "w-1" },
    );

    expect(resolved.get("timeout")?.value).toBe(600);
  });

  it("is deterministic when two policies collide at the same scope", () => {
    const first = policy("WORKSPACE", "w-1", "timeout", 600);
    const second = policy("WORKSPACE", "w-1", "timeout", 900);

    // Whatever order they arrive in, the answer is the same one.
    const a = resolveEffectivePolicies([first, second], context);
    const b = resolveEffectivePolicies([second, first], context);

    expect(a.get("timeout")?.value).toBe(b.get("timeout")?.value);
  });
});
