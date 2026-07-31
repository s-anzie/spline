import { WorkspaceStatus } from "@repo/db";

import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { Workspace } from "../domain/workspace";
import { WorkspaceArchivedError } from "../domain/workspace.errors";
import { WorkspaceNotFoundError } from "./workspace-application.errors";
import { ArchiveWorkspaceUseCase } from "./archive-workspace.use-case";
import { InMemoryWorkspaceRepository } from "./testing/in-memory-workspace.repository";

describe("ArchiveWorkspaceUseCase", () => {
  function setup() {
    const workspaces = new InMemoryWorkspaceRepository();
    const eventPublisher = new FakeEventPublisher();
    const useCase = new ArchiveWorkspaceUseCase(workspaces, eventPublisher);
    return { workspaces, eventPublisher, useCase };
  }

  it("archives an existing workspace and publishes the event", async () => {
    const { workspaces, eventPublisher, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    workspace.clearEvents(); // mirrors production: CreateWorkspaceUseCase already published+cleared this
    await workspaces.save(workspace);

    const result = await useCase.execute(workspace.id.toString());

    expect(result.isSuccess).toBe(true);
    expect(result.value.status).toBe(WorkspaceStatus.ARCHIVED);
    expect(eventPublisher.published.map((e) => e.eventName)).toEqual(["workspace.archived"]);
  });

  it("fails when the workspace does not exist", async () => {
    const { useCase } = setup();

    const result = await useCase.execute("unknown");

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("fails when the workspace is already archived", async () => {
    const { workspaces, useCase } = setup();
    const workspace = Workspace.create({ name: "My Project" });
    workspace.archive();
    await workspaces.save(workspace);

    const result = await useCase.execute(workspace.id.toString());

    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(WorkspaceArchivedError);
  });
});
