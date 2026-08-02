import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../domain/ports/workspace.repository.port";
import { Workspace } from "../domain/workspace";
import {
  EmptyWorkspaceNameError,
  WorkspaceArchivedError,
} from "../domain/workspace.errors";
import { WorkspaceNotFoundError } from "./workspace-application.errors";

export interface RenameWorkspaceInput {
  workspaceId: string;
  newName: string;
  description?: string;
}

export type RenameWorkspaceError =
  WorkspaceNotFoundError | EmptyWorkspaceNameError | WorkspaceArchivedError;

@Injectable()
export class RenameWorkspaceUseCase {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspaces: WorkspaceRepository,
  ) {}

  async execute(
    input: RenameWorkspaceInput,
  ): Promise<Result<Workspace, RenameWorkspaceError>> {
    const workspace = await this.workspaces.findById(
      UniqueEntityId.create(input.workspaceId),
    );
    if (!workspace) {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }

    try {
      workspace.rename(input.newName);
      if (input.description !== undefined) {
        workspace.updateDescription(input.description);
      }
    } catch (error) {
      if (
        error instanceof EmptyWorkspaceNameError ||
        error instanceof WorkspaceArchivedError
      ) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.workspaces.save(workspace);
    return Result.ok(workspace);
  }
}
