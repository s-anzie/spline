import { ActorRef } from "../../identity/domain/actor";
import { Artifact } from "./artifact";

const now = new Date("2026-08-04T10:00:00.000Z");
const later = new Date("2026-08-04T11:00:00.000Z");
const agent = ActorRef.create("AGENT", "a-1").value;

function createArtifact(overrides: Partial<Parameters<typeof Artifact.create>[0]> = {}) {
  return Artifact.create({
    workspaceId: "w-1",
    type: "REPORT",
    name: "Coverage report",
    firstVersion: { checksum: "sha256:aaa", storageRef: "s3://bucket/a" },
    createdBy: agent,
    now,
    ...overrides,
  });
}

describe("Artifact", () => {
  describe("create", () => {
    it("is born ACTIVE with its first version — a trace without content is not a trace", () => {
      const result = createArtifact();

      expect(result.isSuccess).toBe(true);
      const artifact = result.value;
      expect(artifact.status).toBe("ACTIVE");
      expect(artifact.currentVersion).toBe(1);
      expect(artifact.versions).toHaveLength(1);
      expect(artifact.versions[0]?.checksum).toBe("sha256:aaa");
      expect(artifact.immutable).toBe(false);
      expect(artifact.domainEvents[0]?.eventName).toBe("artifact.created");
    });

    it("accepts any SCREAMING_SNAKE_CASE type so extensions can declare their own (§19.2)", () => {
      expect(createArtifact({ type: "SBOM" }).isSuccess).toBe(true);
      expect(createArtifact({ type: "CUSTOM_ENGINE_OUTPUT" }).isSuccess).toBe(true);
      expect(createArtifact({ type: "lowercase" }).isFailure).toBe(true);
      expect(createArtifact({ type: "With Space" }).isFailure).toBe(true);
      expect(createArtifact({ type: " " }).isFailure).toBe(true);
    });

    it("requires a name, a workspace, a checksum and a storage reference", () => {
      expect(createArtifact({ name: " " }).isFailure).toBe(true);
      expect(createArtifact({ workspaceId: "" }).isFailure).toBe(true);
      expect(
        createArtifact({ firstVersion: { checksum: " ", storageRef: "s3://x" } }).isFailure,
      ).toBe(true);
      expect(
        createArtifact({ firstVersion: { checksum: "sha256:a", storageRef: " " } }).isFailure,
      ).toBe(true);
    });

    it("carries optional links, tags and metadata, all trimmed and deduplicated", () => {
      const artifact = createArtifact({
        goalId: "g-1",
        taskId: "t-1",
        repositoryId: "r-1",
        tags: ["  ci  ", "ci", "", "nightly"],
        metadata: { branch: "main" },
      }).value;

      expect(artifact.goalId).toBe("g-1");
      expect(artifact.taskId).toBe("t-1");
      expect(artifact.repositoryId).toBe("r-1");
      expect(artifact.tags).toEqual(["ci", "nightly"]);
      expect(artifact.metadata["branch"]).toBe("main");
    });

    it("can be created immutable — validation reports never get rewritten (§15.7)", () => {
      expect(createArtifact({ immutable: true }).value.immutable).toBe(true);
    });
  });

  describe("versioning (§15.2)", () => {
    it("adds a version without ever replacing the previous one", () => {
      const artifact = createArtifact().value;
      artifact.clearDomainEvents();

      const result = artifact.addVersion(
        { checksum: "sha256:bbb", storageRef: "s3://bucket/b", note: "rerun" },
        agent,
        later,
      );

      expect(result.isSuccess).toBe(true);
      expect(artifact.currentVersion).toBe(2);
      expect(artifact.versions).toHaveLength(2);
      expect(artifact.versions[0]?.checksum).toBe("sha256:aaa");
      expect(artifact.latestVersion?.note).toBe("rerun");
      expect(artifact.domainEvents[0]?.eventName).toBe("artifact.versioned");
    });

    it("refuses a new version on an immutable artifact", () => {
      const artifact = createArtifact({ immutable: true }).value;

      const result = artifact.addVersion(
        { checksum: "sha256:bbb", storageRef: "s3://b" },
        agent,
        later,
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("ImmutableArtifactError");
    });

    it("refuses a new version once archived or deleted", () => {
      const artifact = createArtifact().value;
      artifact.changeStatus("ARCHIVED", later);

      expect(
        artifact.addVersion({ checksum: "c", storageRef: "s" }, agent, later).isFailure,
      ).toBe(true);
    });
  });

  describe("metadata", () => {
    it("updates name, description, tags and metadata", () => {
      const artifact = createArtifact().value;

      const result = artifact.updateMetadata(
        { name: "Renamed", description: "why", tags: ["a"], metadata: { k: 1 } },
        later,
      );

      expect(result.isSuccess).toBe(true);
      expect(artifact.name).toBe("Renamed");
      expect(artifact.tags).toEqual(["a"]);
      expect(artifact.metadata["k"]).toBe(1);
      expect(artifact.updatedAt).toEqual(later);
    });

    it("refuses metadata edits on an immutable artifact", () => {
      const artifact = createArtifact({ immutable: true }).value;

      expect(artifact.updateMetadata({ name: "x" }, later).isFailure).toBe(true);
    });
  });

  describe("links (§15.3)", () => {
    it("links and unlinks a goal, task and repository", () => {
      const artifact = createArtifact().value;
      artifact.clearDomainEvents();

      expect(artifact.link({ taskId: "t-1" }, later).isSuccess).toBe(true);
      expect(artifact.taskId).toBe("t-1");
      expect(artifact.domainEvents[0]?.eventName).toBe("artifact.linked");

      expect(artifact.unlink({ task: true }, later).isSuccess).toBe(true);
      expect(artifact.taskId).toBeNull();
      expect(artifact.domainEvents[1]?.eventName).toBe("artifact.unlinked");
    });

    it("linking to the same target twice raises nothing the second time", () => {
      const artifact = createArtifact({ taskId: "t-1" }).value;
      artifact.clearDomainEvents();

      expect(artifact.link({ taskId: "t-1" }, later).isSuccess).toBe(true);
      expect(artifact.domainEvents).toHaveLength(0);
    });

    it("an immutable artifact can still be linked — immutability is about content", () => {
      const artifact = createArtifact({ immutable: true }).value;

      expect(artifact.link({ goalId: "g-1" }, later).isSuccess).toBe(true);
    });

    it("refuses linking once deleted", () => {
      const artifact = createArtifact().value;
      artifact.changeStatus("ARCHIVED", later);
      artifact.changeStatus("DELETED", later);

      expect(artifact.link({ goalId: "g-1" }, later).isFailure).toBe(true);
    });
  });

  describe("lifecycle (§15.5, §22.6)", () => {
    it("archives, restores, then deletes logically", () => {
      const artifact = createArtifact().value;

      expect(artifact.changeStatus("ARCHIVED", later).isSuccess).toBe(true);
      expect(artifact.changeStatus("ACTIVE", later).isSuccess).toBe(true);
      expect(artifact.changeStatus("ARCHIVED", later).isSuccess).toBe(true);
      expect(artifact.changeStatus("DELETED", later).isSuccess).toBe(true);
      expect(artifact.status).toBe("DELETED");
    });

    it("cannot be deleted without being archived first — nothing vanishes silently", () => {
      const artifact = createArtifact().value;

      const result = artifact.changeStatus("DELETED", later);

      expect(result.isFailure).toBe(true);
      expect(result.error.fromTerminal).toBe(false);
    });

    it("DELETED is terminal", () => {
      const artifact = createArtifact().value;
      artifact.changeStatus("ARCHIVED", later);
      artifact.changeStatus("DELETED", later);

      const result = artifact.changeStatus("ACTIVE", later);

      expect(result.isFailure).toBe(true);
      expect(result.error.fromTerminal).toBe(true);
    });

    it("an immutable artifact is still archivable (§15.7)", () => {
      const artifact = createArtifact({ immutable: true }).value;

      expect(artifact.changeStatus("ARCHIVED", later).isSuccess).toBe(true);
    });

    it("same-status is an idempotent no-op", () => {
      const artifact = createArtifact().value;
      artifact.clearDomainEvents();

      expect(artifact.changeStatus("ACTIVE", later).isSuccess).toBe(true);
      expect(artifact.domainEvents).toHaveLength(0);
    });

    it("exposes reachable statuses (§20.6)", () => {
      expect(createArtifact().value.allowedStatusTargets()).toEqual(["ARCHIVED"]);
    });
  });

  it("reconstitute rebuilds without events", () => {
    const artifact = Artifact.reconstitute(
      {
        workspaceId: "w-1",
        goalId: null,
        taskId: null,
        repositoryId: null,
        type: "REPORT",
        name: "R",
        description: null,
        status: "ACTIVE",
        versions: [
          {
            version: 1,
            checksum: "c",
            storageRef: "s",
            sizeBytes: null,
            createdByType: "AGENT",
            createdById: "a-1",
            createdAt: now,
            note: null,
          },
        ],
        tags: [],
        metadata: {},
        immutable: false,
        createdBy: agent,
        createdAt: now,
        updatedAt: now,
      },
      "art-1",
    );

    expect(artifact.id.value).toBe("art-1");
    expect(artifact.currentVersion).toBe(1);
    expect(artifact.domainEvents).toHaveLength(0);
  });
});
