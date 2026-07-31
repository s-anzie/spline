import { ArtifactStatus, ArtifactType } from "@repo/db";

import { Artifact } from "./artifact";
import { ArtifactArchivedError, EmptyArtifactNameError } from "./artifact.errors";

const HUMAN_1 = { type: "HUMAN" as const, id: "user-1" };
const AGENT_1 = { type: "AGENT" as const, id: "agent-1" };

function createArtifact() {
  return Artifact.create({
    workspaceId: "workspace-1",
    type: ArtifactType.DIFF,
    name: "login-endpoint.diff",
    createdBy: HUMAN_1,
  });
}

describe("Artifact", () => {
  it("creates an active artifact at version 1 with a version history entry", () => {
    const artifact = createArtifact();

    expect(artifact.name).toBe("login-endpoint.diff");
    expect(artifact.type).toBe(ArtifactType.DIFF);
    expect(artifact.status).toBe(ArtifactStatus.ACTIVE);
    expect(artifact.version).toBe(1);
    expect(artifact.versions).toHaveLength(1);
    expect(artifact.versions[0]).toMatchObject({ version: 1, createdByType: "HUMAN", createdById: "user-1" });
  });

  it("records an ArtifactCreated domain event", () => {
    const artifact = createArtifact();

    expect(artifact.domainEvents.map((e) => e.eventName)).toEqual(["artifact.created"]);
  });

  it("rejects an empty name", () => {
    expect(() =>
      Artifact.create({ workspaceId: "w1", type: ArtifactType.NOTE, name: "  ", createdBy: HUMAN_1 }),
    ).toThrow(EmptyArtifactNameError);
  });

  it("updates its metadata", () => {
    const artifact = createArtifact();

    artifact.updateMetadata({ name: "new-name.diff", description: "desc" }, HUMAN_1);

    expect(artifact.name).toBe("new-name.diff");
    expect(artifact.description).toBe("desc");
    expect(artifact.updatedByType).toBe("HUMAN");
  });

  describe("addVersion", () => {
    it("bumps the version and appends to the history", () => {
      const artifact = createArtifact();
      artifact.clearEvents();

      artifact.addVersion({ contentRef: "s3://bucket/v2.diff", checksum: "abc123" }, AGENT_1);

      expect(artifact.version).toBe(2);
      expect(artifact.versions).toHaveLength(2);
      expect(artifact.contentRef).toBe("s3://bucket/v2.diff");
      expect(artifact.checksum).toBe("abc123");
      expect(artifact.domainEvents.map((e) => e.eventName)).toEqual(["artifact.versioned"]);
    });
  });

  describe("linkTo / unlinkFrom", () => {
    it("links the artifact to a task", () => {
      const artifact = createArtifact();
      artifact.clearEvents();

      artifact.linkTo("task", "task-1", HUMAN_1);

      expect(artifact.taskId).toBe("task-1");
      expect(artifact.domainEvents.map((e) => e.eventName)).toEqual(["artifact.linked"]);
    });

    it("links the artifact to a goal, decision and process independently", () => {
      const artifact = createArtifact();

      artifact.linkTo("goal", "goal-1", HUMAN_1);
      artifact.linkTo("decision", "decision-1", HUMAN_1);
      artifact.linkTo("process", "process-1", HUMAN_1);

      expect(artifact.goalId).toBe("goal-1");
      expect(artifact.decisionId).toBe("decision-1");
      expect(artifact.processId).toBe("process-1");
    });

    it("unlinks a target", () => {
      const artifact = createArtifact();
      artifact.linkTo("task", "task-1", HUMAN_1);
      artifact.clearEvents();

      artifact.unlinkFrom("task", HUMAN_1);

      expect(artifact.taskId).toBeUndefined();
      expect(artifact.domainEvents.map((e) => e.eventName)).toEqual(["artifact.unlinked"]);
    });
  });

  describe("archive", () => {
    it("archives the artifact and records the event", () => {
      const artifact = createArtifact();
      artifact.clearEvents();

      artifact.archive(HUMAN_1);

      expect(artifact.status).toBe(ArtifactStatus.ARCHIVED);
      expect(artifact.domainEvents.map((e) => e.eventName)).toEqual(["artifact.archived"]);
    });

    it("cannot be archived twice", () => {
      const artifact = createArtifact();
      artifact.archive(HUMAN_1);

      expect(() => artifact.archive(HUMAN_1)).toThrow(ArtifactArchivedError);
    });

    it("rejects further metadata updates once archived", () => {
      const artifact = createArtifact();
      artifact.archive(HUMAN_1);

      expect(() => artifact.updateMetadata({ name: "new" }, HUMAN_1)).toThrow(ArtifactArchivedError);
    });

    it("rejects new versions once archived", () => {
      const artifact = createArtifact();
      artifact.archive(HUMAN_1);

      expect(() => artifact.addVersion({ contentRef: "x" }, HUMAN_1)).toThrow(ArtifactArchivedError);
    });

    it("rejects linking once archived", () => {
      const artifact = createArtifact();
      artifact.archive(HUMAN_1);

      expect(() => artifact.linkTo("task", "task-1", HUMAN_1)).toThrow(ArtifactArchivedError);
    });
  });
});
