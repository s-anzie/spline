import { Decision } from "../domain/decision";
import { DecisionNotFoundError } from "./decision-application.errors";
import { GetDecisionUseCase } from "./get-decision.use-case";
import { InMemoryDecisionRepository } from "./testing/in-memory-decision.repository";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("GetDecisionUseCase", () => {
  it("returns the decision by id", async () => {
    const decisions = new InMemoryDecisionRepository();
    const decision = Decision.record({
      workspaceId: "w1",
      subject: "Subject",
      decision: "Outcome",
      decidedBy: HUMAN_1,
    });
    await decisions.save(decision);
    const useCase = new GetDecisionUseCase(decisions);

    const result = await useCase.execute(decision.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.subject).toBe("Subject");
  });

  it("fails when the decision does not exist", async () => {
    const decisions = new InMemoryDecisionRepository();
    const useCase = new GetDecisionUseCase(decisions);

    const result = await useCase.execute("unknown");

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(DecisionNotFoundError);
  });
});
