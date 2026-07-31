import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { WORKSPACE_REPOSITORY, WorkspaceRepository } from "../domain/ports/workspace.repository.port";
import { Workspace } from "../domain/workspace";
import { WorkspaceArchivedError } from "../domain/workspace.errors";
import { WorkspaceNotFoundError } from "./workspace-application.errors";

export type ArchiveWorkspaceError = WorkspaceNotFoundError | WorkspaceArchivedError;

@Injectable()
export class ArchiveWorkspaceUseCase {
  constructor(
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(workspaceId: string): Promise<Result<Workspace, ArchiveWorkspaceError>> {
    const workspace = await this.workspaces.findById(UniqueEntityId.create(workspaceId));
    if (!workspace) {
      return Result.fail(new WorkspaceNotFoundError(workspaceId));
    }

    try {
      workspace.archive();
    } catch (error) {
      if (error instanceof WorkspaceArchivedError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.workspaces.save(workspace);
    this.eventPublisher.publishAll(workspace.domainEvents);
    workspace.clearEvents();

    return Result.ok(workspace);
  }
}
