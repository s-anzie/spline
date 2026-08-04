import { Priority } from "../../../kernel/domain/priority";
import { scheduleOf, SchedulableTask } from "./schedule";

const now = new Date("2026-08-04T12:00:00Z");
const earlier = new Date("2026-08-04T08:00:00Z");

function task(overrides: Partial<SchedulableTask> & { id: string }): SchedulableTask {
  return {
    goalId: "g-1",
    status: "READY",
    priority: "NORMAL" as Priority,
    dependsOn: [],
    assignee: null,
    createdAt: now,
    title: `task ${overrides.id}`,
    ...overrides,
  };
}

describe("scheduleOf", () => {
  it("says nothing is ready when there is nothing at all", () => {
    const schedule = scheduleOf([], now);

    expect(schedule.ready).toEqual([]);
    expect(schedule.waiting).toEqual([]);
    expect(schedule.cycles).toEqual([]);
  });

  /** §9.5 — "une tâche devient exécutable lorsque toutes ses dépendances sont satisfaites". */
  it("holds a task back until every dependency is completed", () => {
    const schedule = scheduleOf(
      [
        task({ id: "a", status: "RUNNING" }),
        task({ id: "b", dependsOn: ["a"] }),
      ],
      now,
    );

    expect(schedule.ready.map((entry) => entry.id)).toEqual([]);
    // §17.8 — not merely "not ready", but held by what.
    const held = schedule.waiting.find((entry) => entry.id === "b");
    expect(held?.blockedBy).toEqual([{ id: "a", reason: "dependency not completed" }]);
  });

  it("releases it the moment its dependencies are completed", () => {
    const schedule = scheduleOf(
      [
        task({ id: "a", status: "COMPLETED" }),
        task({ id: "b", dependsOn: ["a"] }),
      ],
      now,
    );

    expect(schedule.ready.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("leaves out what is already finished, cancelled or under way", () => {
    const schedule = scheduleOf(
      [
        task({ id: "done", status: "COMPLETED" }),
        task({ id: "gone", status: "CANCELLED" }),
        task({ id: "running", status: "RUNNING" }),
        task({ id: "reviewing", status: "VALIDATING" }),
        task({ id: "next" }),
      ],
      now,
    );

    expect(schedule.ready.map((entry) => entry.id)).toEqual(["next"]);
    // Nor are they reported as waiting: they are not waiting for anything.
    expect(schedule.waiting.map((entry) => entry.id)).toEqual([]);
  });

  /** §4.22 — a blocked task does not progress, and says so rather than vanishing. */
  it("reports a blocked task as waiting on itself, not as ready", () => {
    const schedule = scheduleOf([task({ id: "stuck", status: "BLOCKED" })], now);

    expect(schedule.ready).toEqual([]);
    expect(schedule.waiting[0]?.blockedBy[0]?.reason).toContain("blocker");
  });

  describe("ordering — tiers compared one after another, never weights (§10.18d)", () => {
    it("puts higher priority first", () => {
      const schedule = scheduleOf(
        [
          task({ id: "low", priority: "LOW" }),
          task({ id: "critical", priority: "CRITICAL" }),
          task({ id: "normal", priority: "NORMAL" }),
        ],
        now,
      );

      expect(schedule.ready.map((entry) => entry.id)).toEqual([
        "critical",
        "normal",
        "low",
      ]);
    });

    /**
     * The property a weighted score cannot give: a BACKGROUND task that
     * unblocks twenty others never overtakes a CRITICAL one. Tier 2 only ever
     * separates tasks of equal priority.
     */
    it("never lets a lower priority overtake, however much it unblocks", () => {
      const schedule = scheduleOf(
        [
          task({ id: "critical", priority: "CRITICAL" }),
          task({ id: "hub", priority: "BACKGROUND" }),
          ...Array.from({ length: 20 }, (_, i) =>
            task({ id: `dep-${i}`, dependsOn: ["hub"] }),
          ),
        ],
        now,
      );

      expect(schedule.ready[0]?.id).toBe("critical");
    });

    it("at equal priority, prefers what unblocks the most", () => {
      const schedule = scheduleOf(
        [
          task({ id: "leaf" }),
          task({ id: "hub" }),
          task({ id: "x", dependsOn: ["hub"] }),
          task({ id: "y", dependsOn: ["hub"] }),
        ],
        now,
      );

      expect(schedule.ready.map((entry) => entry.id)).toEqual(["hub", "leaf"]);
      expect(schedule.ready[0]?.unblocks).toBe(2);
    });

    it("at equal priority and equal reach, prefers the oldest", () => {
      const schedule = scheduleOf(
        [
          task({ id: "recent", createdAt: now }),
          task({ id: "old", createdAt: earlier }),
        ],
        now,
      );

      expect(schedule.ready.map((entry) => entry.id)).toEqual(["old", "recent"]);
    });

    it("is totally deterministic: the same input gives the same order", () => {
      const tasks = [task({ id: "b" }), task({ id: "a" }), task({ id: "c" })];

      const once = scheduleOf(tasks, now).ready.map((entry) => entry.id);
      const twice = scheduleOf([...tasks].reverse(), now).ready.map((e) => e.id);

      expect(once).toEqual(twice);
    });
  });

  /** §9.5 through the kernel's DependencyGraph, written for this chapter. */
  it("names a circular dependency instead of looping on it", () => {
    const schedule = scheduleOf(
      [
        task({ id: "a", dependsOn: ["b"] }),
        task({ id: "b", dependsOn: ["a"] }),
      ],
      now,
    );

    expect(schedule.cycles.length).toBeGreaterThan(0);
    // And neither of them is offered as ready — running either is impossible.
    expect(schedule.ready).toEqual([]);
  });

  it("holds a task whose dependency does not exist, rather than freeing it", () => {
    const schedule = scheduleOf([task({ id: "a", dependsOn: ["ghost"] })], now);

    expect(schedule.ready).toEqual([]);
    expect(schedule.waiting[0]?.blockedBy[0]).toEqual({
      id: "ghost",
      reason: "dependency not found",
    });
  });

  /**
   * §9.16 — a system fully up to date goes silent, and nobody learns new work
   * is needed. An empty queue is never returned bare.
   */
  it("explains an empty queue instead of returning nothing", () => {
    const schedule = scheduleOf(
      [
        task({ id: "a", status: "RUNNING" }),
        task({ id: "b", dependsOn: ["a"] }),
      ],
      now,
    );

    expect(schedule.ready).toEqual([]);
    expect(schedule.summary.readyCount).toBe(0);
    expect(schedule.summary.waitingCount).toBe(1);
    expect(schedule.summary.inFlightCount).toBe(1);
    expect(schedule.summary.nothingToDo).toBe(false);
  });

  it("says outright when there is genuinely nothing to do", () => {
    const schedule = scheduleOf([task({ id: "a", status: "COMPLETED" })], now);

    expect(schedule.summary.nothingToDo).toBe(true);
  });
});
