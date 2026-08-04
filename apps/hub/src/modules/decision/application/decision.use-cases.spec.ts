import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { InMemoryTaskRepository } from "../../task/application/testing/task.doubles";
import { Task } from "../../task/domain/task";
import { ActorRef } from "../../identity/domain/actor";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/workspace.doubles";
import { Workspace } from "../../workspace/domain/workspace";
import { InMemoryDecisionRepository } from "./testing/decision.doubles";
import { GetDecisionUseCase } from "./get-decision.use-case";
import { ListDecisionsUseCase } from "./list-decisions.use-case";
import { RecordDecisionUseCase } from "./record-decision.use-case";
import { SupersedeDecisionUseCase } from "./supersede-decision.use-case";

const now = new Date("2026-08-04T10:00:00.000Z");

async function makeContext() {
  const decisions = new InMemoryDecisionRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const tasks = new InMemoryTaskRepository();
  const clock = new FakeClock(now);
  const publisher = new FakeEventPublisher();
  const workspace = Workspace.create({ organizationId: "org-1", name: "W", now }).value;
  await workspaces.save(workspace);
  const task = Task.create({
    workspaceId: workspace.id.value,
    goalId: "g-1",
    title: "T",
    acceptanceCriteria: ["c"],
    assignee: ActorRef.create("AGENT", "a-1").value,
    now,
  }).value;
  await tasks.save(task);

  const record = new RecordDecisionUseCase(decisions, workspaces, tasks, clock, publisher);
  return {
    decisions,
    workspace,
    workspaces,
    task,
    publisher,
    record,
    get: new GetDecisionUseCase(decisions),
    list: new ListDecisionsUseCase(decisions),
    supersede: new SupersedeDecisionUseCase(decisions, record, clock, publisher),
  };
}

function baseInput(workspaceId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    subject: "Database engine",
    rationale: "JSONB and real transactions",
    outcome: "Use PostgreSQL",
    authorType: "AGENT" as const,
    authorId: "a-1",
    ...overrides,
  };
}

describe("decision use-cases", () => {
  describe("RecordDecisionUseCase", () => {
    it("records and publishes decision.recorded", async () => {
      const ctx = await makeContext();

      const result = await ctx.record.execute(baseInput(ctx.workspace.id.value));

      expect(result.isSuccess).toBe(true);
      expect(ctx.publisher.published.map((e) => e.eventName)).toContain(
        "decision.recorded",
      );
    });

    it("rejects an unknown or non-ACTIVE workspace", async () => {
      const ctx = await makeContext();

      expect((await ctx.record.execute(baseInput("ghost"))).error.name).toBe(
        "WorkspaceNotFoundError",
      );

      ctx.workspace.changeStatus("PAUSED", now);
      await ctx.workspaces.save(ctx.workspace);
      expect(
        (await ctx.record.execute(baseInput(ctx.workspace.id.value))).error.name,
      ).toBe("WorkspaceNotActiveError");
    });

    it("accepts a task of the same workspace and refuses anything else", async () => {
      const ctx = await makeContext();

      expect(
        (
          await ctx.record.execute(
            baseInput(ctx.workspace.id.value, { taskId: ctx.task.id.value }),
          )
        ).isSuccess,
      ).toBe(true);

      const ghost = await ctx.record.execute(
        baseInput(ctx.workspace.id.value, { taskId: "ghost" }),
      );
      expect(ghost.isFailure).toBe(true);
      expect(ghost.error.name).toBe("TaskNotFoundError");
    });

    it("keeps a decision that belongs to no task at all", async () => {
      const ctx = await makeContext();

      const result = await ctx.record.execute(baseInput(ctx.workspace.id.value));

      const decision = await ctx.decisions.findById(result.value.decisionId);
      expect(decision?.taskId).toBeNull();
    });
  });

  describe("supersession in one gesture", () => {
    it("records the replacement and marks the old one, leaving no gap", async () => {
      const ctx = await makeContext();
      const first = await ctx.record.execute(baseInput(ctx.workspace.id.value));

      const result = await ctx.supersede.execute({
        decisionId: first.value.decisionId,
        workspaceId: ctx.workspace.id.value,
        subject: "Database engine",
        rationale: "The JSONB advantage no longer holds for our shape of data",
        outcome: "Move to SQLite",
        authorType: "HUMAN",
        authorId: "u-1",
      });

      expect(result.isSuccess).toBe(true);
      const old = await ctx.decisions.findById(first.value.decisionId);
      const fresh = await ctx.decisions.findById(result.value.decisionId);
      expect(old?.supersededByDecisionId).toBe(result.value.decisionId);
      expect(fresh?.outcome).toBe("Move to SQLite");
      expect(fresh?.isSuperseded).toBe(false);
    });

    it("refuses to supersede a decision that already was", async () => {
      const ctx = await makeContext();
      const first = await ctx.record.execute(baseInput(ctx.workspace.id.value));
      const replacement = {
        decisionId: first.value.decisionId,
        workspaceId: ctx.workspace.id.value,
        subject: "S",
        rationale: "R",
        outcome: "O",
        authorType: "HUMAN" as const,
        authorId: "u-1",
      };
      await ctx.supersede.execute(replacement);

      const again = await ctx.supersede.execute(replacement);

      expect(again.isFailure).toBe(true);
      expect(again.error.name).toBe("DecisionAlreadySupersededError");
    });

    it("does not leave a replacement behind when the old decision is unknown", async () => {
      const ctx = await makeContext();

      const result = await ctx.supersede.execute({
        decisionId: "ghost",
        workspaceId: ctx.workspace.id.value,
        subject: "S",
        rationale: "R",
        outcome: "O",
        authorType: "HUMAN",
        authorId: "u-1",
      });

      expect(result.isFailure).toBe(true);
      expect(ctx.decisions.decisions.size).toBe(0);
    });
  });

  describe("listing", () => {
    it("hides superseded reasoning by default and returns it on request", async () => {
      const ctx = await makeContext();
      const first = await ctx.record.execute(baseInput(ctx.workspace.id.value));
      await ctx.supersede.execute({
        decisionId: first.value.decisionId,
        workspaceId: ctx.workspace.id.value,
        subject: "S",
        rationale: "R",
        outcome: "O",
        authorType: "HUMAN",
        authorId: "u-1",
      });

      const current = await ctx.list.execute({ workspaceId: ctx.workspace.id.value });
      const history = await ctx.list.execute({
        workspaceId: ctx.workspace.id.value,
        includeSuperseded: true,
      });

      expect(current.value).toHaveLength(1);
      expect(history.value).toHaveLength(2);
    });

    it("filters by task, author and confidence, newest first", async () => {
      const ctx = await makeContext();
      const w = ctx.workspace.id.value;
      await ctx.record.execute(baseInput(w, { taskId: ctx.task.id.value }));
      ctx.publisher.published.length = 0;
      await ctx.record.execute(
        baseInput(w, { authorType: "HUMAN", authorId: "u-1", confidence: "HIGH" }),
      );

      expect((await ctx.list.execute({ workspaceId: w })).value).toHaveLength(2);
      expect(
        (await ctx.list.execute({ workspaceId: w, taskId: ctx.task.id.value })).value,
      ).toHaveLength(1);
      expect(
        (await ctx.list.execute({ workspaceId: w, authorType: "HUMAN", authorId: "u-1" }))
          .value,
      ).toHaveLength(1);
      expect(
        (await ctx.list.execute({ workspaceId: w, confidences: ["HIGH"] })).value,
      ).toHaveLength(1);
    });

    it("fails cleanly on an unknown decision", async () => {
      const ctx = await makeContext();

      expect((await ctx.get.execute({ workspaceId: ctx.workspace.id.value, decisionId: "ghost" })).error.name).toBe(
        "DecisionNotFoundError",
      );
    });
  });
});
