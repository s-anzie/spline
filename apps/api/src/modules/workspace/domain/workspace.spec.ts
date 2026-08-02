import { WorkspaceStatus } from "@repo/db";

import { Workspace } from "./workspace";
import {
  EmptyWorkspaceNameError,
  EmptyWorkspaceRootPathError,
  WorkspaceArchivedError,
} from "./workspace.errors";

describe("Workspace", () => {
  it("creates an active workspace with a trimmed name", () => {
    const workspace = Workspace.create({ name: "  My Project  " });

    expect(workspace.name).toBe("My Project");
    expect(workspace.status).toBe(WorkspaceStatus.ACTIVE);
    expect(workspace.ruleset).toEqual({});
  });

  it("records a WorkspaceCreated domain event on creation", () => {
    const workspace = Workspace.create({ name: "My Project" });

    expect(workspace.domainEvents).toHaveLength(1);
    expect(workspace.domainEvents[0]?.eventName).toBe("workspace.created");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(() => Workspace.create({ name: "   " })).toThrow(
      EmptyWorkspaceNameError,
    );
  });

  it("renames the workspace and bumps updatedAt", () => {
    const workspace = Workspace.create({ name: "Old Name" });
    const previousUpdatedAt = workspace.updatedAt;

    workspace.rename("New Name");

    expect(workspace.name).toBe("New Name");
    expect(workspace.updatedAt.getTime()).toBeGreaterThanOrEqual(
      previousUpdatedAt.getTime(),
    );
  });

  it("updates and normalizes the description", () => {
    const workspace = Workspace.create({ name: "Project", description: "Old" });

    workspace.updateDescription("  New description  ");
    expect(workspace.description).toBe("New description");

    workspace.updateDescription("   ");
    expect(workspace.description).toBeUndefined();
  });

  it("updates the ruleset", () => {
    const workspace = Workspace.create({ name: "My Project" });

    workspace.updateRuleset({ maxConcurrentAgents: 3 });

    expect(workspace.ruleset).toEqual({ maxConcurrentAgents: 3 });
  });

  it("sets the root path", () => {
    const workspace = Workspace.create({ name: "My Project" });
    expect(workspace.rootPath).toBeUndefined();

    workspace.setRootPath("/home/bradley/dev-apps/spline");

    expect(workspace.rootPath).toBe("/home/bradley/dev-apps/spline");
  });

  it("rejects an empty root path", () => {
    const workspace = Workspace.create({ name: "My Project" });

    expect(() => workspace.setRootPath("   ")).toThrow(
      EmptyWorkspaceRootPathError,
    );
  });

  it("archives the workspace and records a domain event", () => {
    const workspace = Workspace.create({ name: "My Project" });
    workspace.clearEvents();

    workspace.archive();

    expect(workspace.status).toBe(WorkspaceStatus.ARCHIVED);
    expect(workspace.domainEvents.map((e) => e.eventName)).toEqual([
      "workspace.archived",
    ]);
  });

  it("cannot be archived twice", () => {
    const workspace = Workspace.create({ name: "My Project" });
    workspace.archive();

    expect(() => workspace.archive()).toThrow(WorkspaceArchivedError);
  });

  it("cannot be renamed once archived", () => {
    const workspace = Workspace.create({ name: "My Project" });
    workspace.archive();

    expect(() => workspace.rename("New Name")).toThrow(WorkspaceArchivedError);
  });

  it("cannot have its ruleset updated once archived", () => {
    const workspace = Workspace.create({ name: "My Project" });
    workspace.archive();

    expect(() => workspace.updateRuleset({})).toThrow(WorkspaceArchivedError);
  });

  it("duplicates into a fresh, active workspace with a new id", () => {
    const source = Workspace.create({
      name: "Source",
      description: "A source workspace",
      ruleset: { maxConcurrentAgents: 2 },
    });

    const copy = source.duplicate("Source copy");

    expect(copy.id.equals(source.id)).toBe(false);
    expect(copy.name).toBe("Source copy");
    expect(copy.description).toBe("A source workspace");
    expect(copy.ruleset).toEqual({ maxConcurrentAgents: 2 });
    expect(copy.status).toBe(WorkspaceStatus.ACTIVE);
  });

  it("can duplicate an archived workspace into a new active one", () => {
    const source = Workspace.create({ name: "Source" });
    source.archive();

    const copy = source.duplicate("Source copy");

    expect(copy.status).toBe(WorkspaceStatus.ACTIVE);
  });
});
