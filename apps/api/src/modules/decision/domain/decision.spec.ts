import { Decision } from "./decision";
import {
  EmptyDecisionOutcomeError,
  EmptyDecisionSubjectError,
  InvalidDecisionConfidenceError,
} from "./decision.errors";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const AGENT_1 = { type: "AGENT" as const, id: "agent-1" };
const NOW = new Date("2026-07-31T10:00:00Z");

function recordDecision(overrides: Partial<Parameters<typeof Decision.record>[0]> = {}, at: Date = NOW) {
  return Decision.record(
    {
      workspaceId: "w1",
      subject: "Which HTTP client to use",
      decision: "Use undici",
      decidedBy: HUMAN_1,
      ...overrides,
    },
    at,
  );
}

describe("Decision", () => {
  it("records a decision with sensible defaults", () => {
    const decision = recordDecision();

    expect(decision.workspaceId).toBe("w1");
    expect(decision.subject).toBe("Which HTTP client to use");
    expect(decision.decision).toBe("Use undici");
    expect(decision.decidedByType).toBe("HUMAN");
    expect(decision.decidedById).toBe("user-1");
    expect(decision.decidedAt).toEqual(NOW);
    expect(decision.context).toBeUndefined();
    expect(decision.confidence).toBeUndefined();
    expect(decision.optionsConsidered).toEqual([]);
    expect(decision.references).toEqual([]);
  });

  it("records optional fields when provided", () => {
    const decision = recordDecision({
      context: "Needed HTTP/2 support",
      optionsConsidered: ["axios", "node-fetch", "undici"],
      confidence: 0.8,
      references: ["artifact-1", "https://example.com/benchmark"],
      decidedBy: AGENT_1,
    });

    expect(decision.context).toBe("Needed HTTP/2 support");
    expect(decision.optionsConsidered).toEqual(["axios", "node-fetch", "undici"]);
    expect(decision.confidence).toBe(0.8);
    expect(decision.references).toEqual(["artifact-1", "https://example.com/benchmark"]);
    expect(decision.decidedByType).toBe("AGENT");
    expect(decision.decidedById).toBe("agent-1");
  });

  it("records a DecisionRecorded domain event", () => {
    const decision = recordDecision();

    expect(decision.domainEvents.map((e) => e.eventName)).toEqual(["decision.recorded"]);
  });

  it("rejects an empty subject", () => {
    expect(() => recordDecision({ subject: "   " })).toThrow(EmptyDecisionSubjectError);
  });

  it("rejects an empty decision outcome", () => {
    expect(() => recordDecision({ decision: "   " })).toThrow(EmptyDecisionOutcomeError);
  });

  it("rejects a confidence below 0", () => {
    expect(() => recordDecision({ confidence: -0.01 })).toThrow(InvalidDecisionConfidenceError);
  });

  it("rejects a confidence above 1", () => {
    expect(() => recordDecision({ confidence: 1.01 })).toThrow(InvalidDecisionConfidenceError);
  });

  it("accepts boundary confidence values 0 and 1", () => {
    expect(() => recordDecision({ confidence: 0 })).not.toThrow();
    expect(() => recordDecision({ confidence: 1 })).not.toThrow();
  });

  it("reconstitutes from persistence without emitting a domain event", () => {
    const original = recordDecision();
    const reconstituted = Decision.reconstitute(
      {
        workspaceId: original.workspaceId,
        subject: original.subject,
        context: original.context,
        optionsConsidered: original.optionsConsidered,
        decision: original.decision,
        decidedByType: original.decidedByType,
        decidedById: original.decidedById,
        decidedAt: original.decidedAt,
        confidence: original.confidence,
        references: original.references,
      },
      original.id,
    );

    expect(reconstituted.domainEvents).toEqual([]);
    expect(reconstituted.subject).toBe(original.subject);
    expect(reconstituted.id.equals(original.id)).toBe(true);
  });
});
