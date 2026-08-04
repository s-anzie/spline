import { ActorRef } from "../../identity/domain/actor";
import { Decision } from "./decision";

const now = new Date("2026-08-04T10:00:00.000Z");
const later = new Date("2026-08-04T11:00:00.000Z");
const agent = ActorRef.create("AGENT", "a-1").value;

function record(overrides: Partial<Parameters<typeof Decision.record>[0]> = {}) {
  return Decision.record({
    workspaceId: "w-1",
    subject: "Database engine",
    rationale: "Postgres gives us JSONB and real transactions",
    outcome: "Use PostgreSQL",
    author: agent,
    now,
    ...overrides,
  });
}

describe("Decision", () => {
  describe("record", () => {
    it("captures the reasoning with a default confidence and raises decision.recorded", () => {
      const result = record();

      expect(result.isSuccess).toBe(true);
      const decision = result.value;
      expect(decision.subject).toBe("Database engine");
      expect(decision.outcome).toBe("Use PostgreSQL");
      expect(decision.confidence).toBe("MEDIUM");
      expect(decision.taskId).toBeNull();
      expect(decision.isSuperseded).toBe(false);
      expect(decision.decidedAt).toEqual(now);
      expect(decision.domainEvents[0]?.eventName).toBe("decision.recorded");
    });

    it("keeps the alternatives that were weighed, each with why it lost", () => {
      const decision = record({
        alternatives: [
          { option: "MySQL", rejectedBecause: "weaker JSON support" },
          { option: "SQLite", rejectedBecause: "no concurrent writers" },
        ],
      }).value;

      expect(decision.alternatives).toHaveLength(2);
      expect(decision.alternatives[0]?.option).toBe("MySQL");
      expect(decision.alternatives[1]?.rejectedBecause).toBe("no concurrent writers");
    });

    it("drops alternatives whose option or reason is blank, rather than storing noise", () => {
      const decision = record({
        alternatives: [
          { option: "  MySQL  ", rejectedBecause: "  slower  " },
          { option: " ", rejectedBecause: "x" },
          { option: "y", rejectedBecause: " " },
        ],
      }).value;

      expect(decision.alternatives).toEqual([
        { option: "MySQL", rejectedBecause: "slower" },
      ]);
    });

    it("requires a workspace, a subject, a rationale and an outcome", () => {
      expect(record({ workspaceId: "" }).isFailure).toBe(true);
      expect(record({ subject: " " }).isFailure).toBe(true);
      expect(record({ rationale: "  " }).isFailure).toBe(true);
      expect(record({ outcome: "" }).isFailure).toBe(true);
    });

    it("accepts an explicit confidence and an optional task", () => {
      const decision = record({ confidence: "HIGH", taskId: "t-1" }).value;

      expect(decision.confidence).toBe("HIGH");
      expect(decision.taskId).toBe("t-1");
    });

    it("records who decided", () => {
      const human = ActorRef.create("HUMAN", "u-1").value;

      expect(record({ author: human }).value.author.type).toBe("HUMAN");
    });
  });

  describe("supersession — a decision is replaced, never rewritten", () => {
    it("marks the decision as superseded and raises decision.superseded", () => {
      const decision = record().value;
      decision.clearDomainEvents();

      const result = decision.supersede("d-new", later);

      expect(result.isSuccess).toBe(true);
      expect(decision.isSuperseded).toBe(true);
      expect(decision.supersededByDecisionId).toBe("d-new");
      expect(decision.domainEvents[0]?.eventName).toBe("decision.superseded");
    });

    it("is idempotent when superseded by the same decision again", () => {
      const decision = record().value;
      decision.supersede("d-new", later);
      decision.clearDomainEvents();

      expect(decision.supersede("d-new", later).isSuccess).toBe(true);
      expect(decision.domainEvents).toHaveLength(0);
    });

    it("refuses to be superseded twice by different decisions", () => {
      const decision = record().value;
      decision.supersede("d-new", later);

      const result = decision.supersede("d-other", later);

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("DecisionAlreadySupersededError");
    });

    it("refuses to supersede itself", () => {
      const decision = record().value;

      const result = decision.supersede(decision.id.value, later);

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("DecisionSupersessionError");
    });

    it("refuses an empty replacement id", () => {
      expect(record().value.supersede("  ", later).isFailure).toBe(true);
    });
  });

  it("exposes no mutator beyond supersession — the reasoning of the past stays readable", () => {
    const decision = record().value;
    const mutators = Object.getOwnPropertyNames(Object.getPrototypeOf(decision)).filter(
      (name) =>
        typeof (decision as unknown as Record<string, unknown>)[name] === "function" &&
        !["constructor", "equals", "clearDomainEvents"].includes(name),
    );

    expect(mutators).toEqual(["supersede"]);
  });

  it("reconstitute rebuilds without events", () => {
    const decision = Decision.reconstitute(
      {
        workspaceId: "w-1",
        taskId: null,
        subject: "S",
        rationale: "R",
        alternatives: [],
        outcome: "O",
        confidence: "LOW",
        author: agent,
        supersededByDecisionId: "d-2",
        decidedAt: now,
      },
      "d-1",
    );

    expect(decision.id.value).toBe("d-1");
    expect(decision.isSuperseded).toBe(true);
    expect(decision.domainEvents).toHaveLength(0);
  });
});
