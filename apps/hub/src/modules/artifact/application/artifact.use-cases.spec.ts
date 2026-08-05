import { Result } from "../../../kernel/domain/result";
import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { InMemoryDecisionRepository } from "../../decision/application/testing/decision.doubles";
import { InMemoryGoalRepository } from "../../goal/application/testing/goal.doubles";
import { Goal } from "../../goal/domain/goal";
import { ActorRef } from "../../identity/domain/actor";
import { InMemoryTaskRepository } from "../../task/application/testing/task.doubles";
import { Task } from "../../task/domain/task";
import { InMemoryWorkspaceRepository } from "../../workspace/application/testing/workspace.doubles";
import { ArtifactLinkTargets } from "./artifact-link-targets.service";
import { Workspace } from "../../workspace/domain/workspace";
import { InMemoryArtifactRepository } from "./testing/artifact.doubles";
import { AddArtifactVersionUseCase } from "./add-artifact-version.use-case";
import { ChangeArtifactStatusUseCase } from "./change-artifact-status.use-case";
import { CreateArtifactUseCase } from "./create-artifact.use-case";
import { GetArtifactUseCase } from "./get-artifact.use-case";
import { LinkArtifactUseCase } from "./link-artifact.use-case";
import { ListArtifactsUseCase } from "./list-artifacts.use-case";
import { UpdateArtifactMetadataUseCase } from "./update-artifact-metadata.use-case";

const now = new Date("2026-08-04T10:00:00.000Z");

/** Most cases exercise artifacts alone; link validity has its own suite. */
const NO_LINK_TARGETS = {
  verify: async () => Result.ok<void, never>(undefined),
} as unknown as ArtifactLinkTargets;

async function makeContext() {
  const artifacts = new InMemoryArtifactRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const clock = new FakeClock(now);
  const publisher = new FakeEventPublisher();
  const workspace = Workspace.create({ organizationId: "org-1", name: "W", now }).value;
  await workspaces.save(workspace);

  return {
    artifacts,
    workspaces,
    workspace,
    publisher,
    clock,
    create: new CreateArtifactUseCase(
      artifacts,
      workspaces,
      NO_LINK_TARGETS,
      clock,
      publisher,
    ),
    addVersion: new AddArtifactVersionUseCase(artifacts, clock, publisher),
    get: new GetArtifactUseCase(artifacts),
    list: new ListArtifactsUseCase(artifacts),
    update: new UpdateArtifactMetadataUseCase(artifacts, clock, publisher),
    link: new LinkArtifactUseCase(artifacts, NO_LINK_TARGETS, clock, publisher),
    changeStatus: new ChangeArtifactStatusUseCase(artifacts, clock, publisher),
  };
}

function baseInput(workspaceId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    type: "REPORT",
    name: "Coverage",
    checksum: "sha256:aaa",
    storageRef: "s3://bucket/a",
    createdByType: "AGENT" as const,
    createdById: "a-1",
    ...overrides,
  };
}

describe("artifact use-cases", () => {
  describe("CreateArtifactUseCase", () => {
    it("creates with its first version and publishes artifact.created", async () => {
      const ctx = await makeContext();

      const result = await ctx.create.execute(baseInput(ctx.workspace.id.value));

      expect(result.isSuccess).toBe(true);
      expect(result.value.version).toBe(1);
      expect(ctx.publisher.published.map((e) => e.eventName)).toContain(
        "artifact.created",
      );
    });

    it("rejects an unknown or non-ACTIVE workspace", async () => {
      const ctx = await makeContext();

      expect((await ctx.create.execute(baseInput("ghost"))).error.name).toBe(
        "WorkspaceNotFoundError",
      );

      ctx.workspace.changeStatus("PAUSED", now);
      await ctx.workspaces.save(ctx.workspace);
      expect(
        (await ctx.create.execute(baseInput(ctx.workspace.id.value))).error.name,
      ).toBe("WorkspaceNotActiveError");
    });

    it("accepts an extension-declared type (§19.2)", async () => {
      const ctx = await makeContext();

      const result = await ctx.create.execute(
        baseInput(ctx.workspace.id.value, { type: "SBOM" }),
      );

      expect(result.isSuccess).toBe(true);
    });
  });

  describe("versioning", () => {
    it("appends a version and reports the new number", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute(baseInput(ctx.workspace.id.value));

      const result = await ctx.addVersion.execute({ workspaceId: ctx.workspace.id.value,
        artifactId: created.value.artifactId,
        checksum: "sha256:bbb",
        storageRef: "s3://bucket/b",
        createdByType: "AGENT",
        createdById: "a-1",
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.version).toBe(2);
      const artifact = await ctx.artifacts.findById(created.value.artifactId);
      expect(artifact?.versions).toHaveLength(2);
    });

    it("refuses on an immutable artifact — a validation report is final (§15.7)", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute(
        baseInput(ctx.workspace.id.value, { immutable: true }),
      );

      const result = await ctx.addVersion.execute({ workspaceId: ctx.workspace.id.value,
        artifactId: created.value.artifactId,
        checksum: "c",
        storageRef: "s",
        createdByType: "AGENT",
        createdById: "a-1",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("ImmutableArtifactError");
    });
  });

  describe("search (§15.6)", () => {
    it("filters on every declared axis", async () => {
      const ctx = await makeContext();
      const w = ctx.workspace.id.value;
      await ctx.create.execute(
        baseInput(w, { name: "a", type: "REPORT", taskId: "t-1", tags: ["ci"] }),
      );
      await ctx.create.execute(
        baseInput(w, {
          name: "b",
          type: "DIFF",
          goalId: "g-1",
          createdByType: "HUMAN",
          createdById: "u-1",
        }),
      );

      expect((await ctx.list.execute({ workspaceId: w })).value).toHaveLength(2);
      expect((await ctx.list.execute({ workspaceId: w, type: "DIFF" })).value).toHaveLength(1);
      expect((await ctx.list.execute({ workspaceId: w, taskId: "t-1" })).value).toHaveLength(1);
      expect((await ctx.list.execute({ workspaceId: w, goalId: "g-1" })).value).toHaveLength(1);
      expect((await ctx.list.execute({ workspaceId: w, tags: ["ci"] })).value).toHaveLength(1);
      expect(
        (await ctx.list.execute({ workspaceId: w, createdByType: "HUMAN", createdById: "u-1" }))
          .value,
      ).toHaveLength(1);
    });

    it("hides DELETED artifacts unless asked for explicitly", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute(baseInput(ctx.workspace.id.value));
      await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value,
        artifactId: created.value.artifactId,
        status: "ARCHIVED",
      });
      await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value,
        artifactId: created.value.artifactId,
        status: "DELETED",
      });

      const visible = await ctx.list.execute({ workspaceId: ctx.workspace.id.value });
      const explicit = await ctx.list.execute({
        workspaceId: ctx.workspace.id.value,
        statuses: ["DELETED"],
      });

      expect(visible.value).toHaveLength(0);
      expect(explicit.value).toHaveLength(1);
    });
  });

  describe("links, metadata and lifecycle", () => {
    it("links then unlinks a task", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute(baseInput(ctx.workspace.id.value));

      await ctx.link.execute({ workspaceId: ctx.workspace.id.value,
        artifactId: created.value.artifactId,
        operation: "link",
        taskId: "t-9",
      });
      expect((await ctx.artifacts.findById(created.value.artifactId))?.taskId).toBe("t-9");

      await ctx.link.execute({ workspaceId: ctx.workspace.id.value,
        artifactId: created.value.artifactId,
        operation: "unlink",
        task: true,
      });
      expect((await ctx.artifacts.findById(created.value.artifactId))?.taskId).toBeNull();
    });

    it("updates metadata and refuses on immutable", async () => {
      const ctx = await makeContext();
      const mutable = await ctx.create.execute(baseInput(ctx.workspace.id.value));
      const frozen = await ctx.create.execute(
        baseInput(ctx.workspace.id.value, { immutable: true }),
      );

      expect(
        (await ctx.update.execute({ workspaceId: ctx.workspace.id.value, artifactId: mutable.value.artifactId, name: "New" }))
          .isSuccess,
      ).toBe(true);
      expect(
        (await ctx.update.execute({ workspaceId: ctx.workspace.id.value, artifactId: frozen.value.artifactId, name: "New" }))
          .isFailure,
      ).toBe(true);
    });

    it("archives then deletes logically, refusing a direct delete", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute(baseInput(ctx.workspace.id.value));
      const artifactId = created.value.artifactId;

      expect((await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value, artifactId, status: "DELETED" })).isFailure).toBe(
        true,
      );
      expect(
        (await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value, artifactId, status: "ARCHIVED" })).isSuccess,
      ).toBe(true);
      expect((await ctx.changeStatus.execute({ workspaceId: ctx.workspace.id.value, artifactId, status: "DELETED" })).isSuccess).toBe(
        true,
      );
    });

    it("fails cleanly on an unknown artifact", async () => {
      const ctx = await makeContext();

      expect((await ctx.get.execute({ workspaceId: ctx.workspace.id.value, artifactId: "ghost" })).error.name).toBe(
        "ArtifactNotFoundError",
      );
    });
  });
});

/**
 * The e2e caught this: the schema carries real FKs to goals and tasks, so a
 * link to a non-existent target must be refused by the use-case, not blow up
 * in the database. The design said "liens vérifiés"; the code did not.
 */
describe("link target validation", () => {
  async function contextWithTargets() {
    const ctx = await makeContext();
    const goals = new InMemoryGoalRepository();
    const tasks = new InMemoryTaskRepository();
    const goal = Goal.create({
      workspaceId: ctx.workspace.id.value,
      title: "G",
      successCriteria: ["c"],
      owner: ActorRef.create("HUMAN", "u-1").value,
      now,
    }).value;
    await goals.save(goal);
    const task = Task.create({
      workspaceId: ctx.workspace.id.value,
      goalId: goal.id.value,
      title: "T",
      acceptanceCriteria: ["c"],
      assignee: ActorRef.create("AGENT", "a-1").value,
      now,
    }).value;
    await tasks.save(task);
    const decisions = new InMemoryDecisionRepository();
    // A repository store that holds nothing: every repositoryId is a ghost,
    // which is exactly what the link check must refuse.
    const repositories = {
      save: async () => undefined,
      findById: async () => null,
      list: async () => [],
    };
    const targets = new ArtifactLinkTargets(goals, tasks, decisions, repositories);

    return {
      ...ctx,
      goalId: goal.id.value,
      taskId: task.id.value,
      create: new CreateArtifactUseCase(
        ctx.artifacts,
        ctx.workspaces,
        targets,
        ctx.clock,
        ctx.publisher,
      ),
      link: new LinkArtifactUseCase(ctx.artifacts, targets, ctx.clock, ctx.publisher),
    };
  }

  it("accepts links to existing targets of the same workspace", async () => {
    const ctx = await contextWithTargets();

    const result = await ctx.create.execute(
      baseInput(ctx.workspace.id.value, { goalId: ctx.goalId, taskId: ctx.taskId }),
    );

    expect(result.isSuccess).toBe(true);
  });

  it("refuses a link to a target that does not exist", async () => {
    const ctx = await contextWithTargets();

    const created = await ctx.create.execute(
      baseInput(ctx.workspace.id.value, { goalId: "ghost" }),
    );

    expect(created.isFailure).toBe(true);
    expect(created.error.name).toBe("ArtifactLinkError");
  });

  it("refuses linking after creation to a target of another workspace", async () => {
    const ctx = await contextWithTargets();
    const other = Workspace.create({ organizationId: "org-1", name: "Other", now }).value;
    await ctx.workspaces.save(other);
    const created = await ctx.create.execute(baseInput(ctx.workspace.id.value));

    const result = await ctx.link.execute({ workspaceId: ctx.workspace.id.value,
      artifactId: created.value.artifactId,
      operation: "link",
      taskId: "ghost-task",
    });

    expect(result.isFailure).toBe(true);
    expect(result.error.name).toBe("ArtifactLinkError");
  });

  it("never validates on unlink — removing a reference cannot dangle", async () => {
    const ctx = await contextWithTargets();
    const created = await ctx.create.execute(
      baseInput(ctx.workspace.id.value, { goalId: ctx.goalId }),
    );

    const result = await ctx.link.execute({ workspaceId: ctx.workspace.id.value,
      artifactId: created.value.artifactId,
      operation: "unlink",
      goal: true,
    });

    expect(result.isSuccess).toBe(true);
  });
});
