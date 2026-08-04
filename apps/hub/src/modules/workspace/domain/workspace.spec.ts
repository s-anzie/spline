import { Workspace } from "./workspace";

const now = new Date("2026-08-04T10:00:00.000Z");
const later = new Date("2026-08-04T11:00:00.000Z");

function createWorkspace(overrides: Partial<Parameters<typeof Workspace.create>[0]> = {}) {
  return Workspace.create({
    organizationId: "org-1",
    name: "Spline Core",
    now,
    ...overrides,
  });
}

describe("Workspace", () => {
  describe("create", () => {
    it("creates ACTIVE, slugs the name, starts with empty settings, raises workspace.created", () => {
      const result = createWorkspace();

      expect(result.isSuccess).toBe(true);
      const workspace = result.value;
      expect(workspace.status).toBe("ACTIVE");
      expect(workspace.slug).toBe("spline-core");
      expect(workspace.organizationId).toBe("org-1");
      expect(workspace.settings).toEqual({});
      expect(workspace.createdAt).toEqual(now);
      expect(workspace.updatedAt).toEqual(now);
      expect(workspace.domainEvents[0]?.eventName).toBe("workspace.created");
    });

    it("keeps caller-provided settings verbatim — settings are configuration, not policy", () => {
      const workspace = createWorkspace({
        settings: { rootPath: "/srv/project" },
      }).value;

      expect(workspace.settings["rootPath"]).toBe("/srv/project");
    });

    it("accepts an optional description", () => {
      const workspace = createWorkspace({ description: "The main project" }).value;

      expect(workspace.description).toBe("The main project");
    });

    it("rejects empty name, empty organizationId, and a name that slugifies to nothing", () => {
      expect(createWorkspace({ name: " " }).isFailure).toBe(true);
      expect(createWorkspace({ organizationId: "" }).isFailure).toBe(true);
      expect(createWorkspace({ name: "###" }).isFailure).toBe(true);
    });

  });

  describe("updateDetails", () => {
    it("renames (re-slugs), updates description, merges settings, raises workspace.updated", () => {
      const workspace = createWorkspace().value;
      workspace.clearDomainEvents();

      const result = workspace.updateDetails(
        { name: "New Name!", description: "desc", settings: { extra: 1 } },
        later,
      );

      expect(result.isSuccess).toBe(true);
      expect(workspace.name).toBe("New Name!");
      expect(workspace.slug).toBe("new-name");
      expect(workspace.description).toBe("desc");
      expect(workspace.settings["extra"]).toBe(1);
      expect(workspace.updatedAt).toEqual(later);
      expect(workspace.domainEvents[0]?.eventName).toBe("workspace.updated");
    });

    it("is only allowed while ACTIVE", () => {
      const workspace = createWorkspace().value;
      workspace.changeStatus("PAUSED", later);

      const result = workspace.updateDetails({ description: "x" }, later);

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("WorkspaceNotActiveError");
    });
  });

  describe("changeStatus (§22.6)", () => {
    it("walks the full lifecycle ACTIVE→PAUSED→ACTIVE→ARCHIVED→ACTIVE→ARCHIVED→DELETED", () => {
      const workspace = createWorkspace().value;

      for (const next of ["PAUSED", "ACTIVE", "ARCHIVED", "ACTIVE", "ARCHIVED", "DELETED"] as const) {
        expect(workspace.changeStatus(next, later).isSuccess).toBe(true);
        expect(workspace.status).toBe(next);
      }
    });

    it("same-state transition is an idempotent no-op without event", () => {
      const workspace = createWorkspace().value;
      workspace.clearDomainEvents();

      const result = workspace.changeStatus("ACTIVE", later);

      expect(result.isSuccess).toBe(true);
      expect(workspace.domainEvents).toHaveLength(0);
    });

    it("a real transition raises workspace.status_changed once", () => {
      const workspace = createWorkspace().value;
      workspace.clearDomainEvents();

      workspace.changeStatus("PAUSED", later);

      expect(workspace.domainEvents).toHaveLength(1);
      expect(workspace.domainEvents[0]?.eventName).toBe("workspace.status_changed");
    });

    it("cannot delete without archiving first — typed failure, not terminal", () => {
      const workspace = createWorkspace().value;

      const result = workspace.changeStatus("DELETED", later);

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("InvalidStateTransitionError");
      expect(result.error.fromTerminal).toBe(false);
    });

    it("DELETED is terminal — leaving it fails with fromTerminal", () => {
      const workspace = createWorkspace().value;
      workspace.changeStatus("ARCHIVED", later);
      workspace.changeStatus("DELETED", later);

      const result = workspace.changeStatus("ACTIVE", later);

      expect(result.isFailure).toBe(true);
      expect(result.error.fromTerminal).toBe(true);
    });

    it("exposes the reachable statuses for interface affordances (§20.6)", () => {
      const workspace = createWorkspace().value;

      expect(workspace.allowedStatusTargets()).toEqual(["PAUSED", "ARCHIVED"]);
    });
  });

  it("reconstitute rebuilds from persistence without events", () => {
    const workspace = Workspace.reconstitute(
      {
        organizationId: "org-1",
        name: "Spline Core",
        slug: "spline-core",
        description: null,
        status: "PAUSED",
        settings: {},
        createdAt: now,
        updatedAt: later,
      },
      "w-1",
    );

    expect(workspace.id.value).toBe("w-1");
    expect(workspace.status).toBe("PAUSED");
    expect(workspace.domainEvents).toHaveLength(0);
  });
});
