import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/in-memory-workspace.repository";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { Workspace } from "../../workspace/domain/workspace";
import {
  EmptyDecisionOutcomeError,
  EmptyDecisionSubjectError,
  InvalidDecisionConfidenceError,
} from "../domain/decision.errors";
import { InMemoryDecisionRepository } from "./testing/in-memory-decision.repository";
import { RecordDecisionUseCase } from "./record-decision.use-case";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const NOW = new Date("2026-07-31T10:00:00Z");

async function setup() {
  const decisions = new InMemoryDecisionRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const clock = new FakeClock(NOW);
  const eventPublisher = new FakeEventPublisher();

  const workspace = Workspace.create({ name: "My Project" });
  await workspaces.save(workspace);

  const useCase = new RecordDecisionUseCase(decisions, new GetWorkspaceUseCase(workspaces), clock, eventPublisher);

  return { workspace, decisions, eventPublisher, useCase };
}

describe("RecordDecisionUseCase", () => {
  it("records a decision, persists it, and publishes its domain events", async () => {
    const { workspace, decisions, eventPublisher, useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      subject: "Which HTTP client to use",
      decision: "Use undici",
      decidedBy: HUMAN_1,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.subject).toBe("Which HTTP client to use");
    expect(result.value.decidedAt).toEqual(NOW);

    const persisted = await decisions.findById(result.value.id);
    expect(persisted).not.toBeNull();
    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["decision.recorded"]);
    expect(result.value.domainEvents).toEqual([]);
  });

  it("fails when the workspace does not exist", async () => {
    const { useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: "unknown",
      subject: "Subject",
      decision: "Outcome",
      decidedBy: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("fails on an empty subject", async () => {
    const { workspace, useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      subject: "   ",
      decision: "Outcome",
      decidedBy: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyDecisionSubjectError);
  });

  it("fails on an empty decision outcome", async () => {
    const { workspace, useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      subject: "Subject",
      decision: "   ",
      decidedBy: HUMAN_1,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(EmptyDecisionOutcomeError);
  });

  it("fails on an out-of-range confidence", async () => {
    const { workspace, useCase } = await setup();

    const result = await useCase.execute({
      workspaceId: workspace.id.toString(),
      subject: "Subject",
      decision: "Outcome",
      decidedBy: HUMAN_1,
      confidence: 1.5,
    });

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(InvalidDecisionConfidenceError);
  });
});
