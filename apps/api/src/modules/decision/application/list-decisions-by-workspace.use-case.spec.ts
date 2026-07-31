import { Decision } from "../domain/decision";
import { InMemoryDecisionRepository } from "./testing/in-memory-decision.repository";
import { ListDecisionsByWorkspaceUseCase } from "./list-decisions-by-workspace.use-case";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };

describe("ListDecisionsByWorkspaceUseCase", () => {
  it("lists only decisions belonging to the given workspace", async () => {
    const decisions = new InMemoryDecisionRepository();
    await decisions.save(Decision.record({ workspaceId: "w1", subject: "S1", decision: "O1", decidedBy: HUMAN_1 }));
    await decisions.save(Decision.record({ workspaceId: "w1", subject: "S2", decision: "O2", decidedBy: HUMAN_1 }));
    await decisions.save(Decision.record({ workspaceId: "w2", subject: "S3", decision: "O3", decidedBy: HUMAN_1 }));
    const useCase = new ListDecisionsByWorkspaceUseCase(decisions);

    const result = await useCase.execute("w1");

    expect(result.map((d) => d.subject).sort()).toEqual(["S1", "S2"]);
  });
});
