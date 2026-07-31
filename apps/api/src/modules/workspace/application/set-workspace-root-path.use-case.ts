import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { WORKSPACE_REPOSITORY, WorkspaceRepository } from "../domain/ports/workspace.repository.port";
import { Workspace } from "../domain/workspace";
import { EmptyWorkspaceRootPathError, WorkspaceArchivedError } from "../domain/workspace.errors";
import { WorkspaceNotFoundError } from "./workspace-application.errors";

export interface SetWorkspaceRootPathInput {
  workspaceId: string;
  rootPath: string;
}

export type SetWorkspaceRootPathError =
  | WorkspaceNotFoundError
  | WorkspaceArchivedError
  | EmptyWorkspaceRootPathError;

@Injectable()
export class SetWorkspaceRootPathUseCase {
  constructor(@Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository) {}

  async execute(
    input: SetWorkspaceRootPathInput,
  ): Promise<Result<Workspace, SetWorkspaceRootPathError>> {
    const workspace = await this.workspaces.findById(UniqueEntityId.create(input.workspaceId));
    if (!workspace) {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }

    try {
      workspace.setRootPath(input.rootPath);
    } catch (error) {
      if (error instanceof WorkspaceArchivedError || error instanceof EmptyWorkspaceRootPathError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.workspaces.save(workspace);
    return Result.ok(workspace);
  }
}
