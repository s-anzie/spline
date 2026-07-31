import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { WORKSPACE_REPOSITORY, WorkspaceRepository } from "../domain/ports/workspace.repository.port";
import { Workspace } from "../domain/workspace";
import { WorkspaceNotFoundError } from "./workspace-application.errors";

@Injectable()
export class GetWorkspaceUseCase {
  constructor(@Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository) {}

  async execute(workspaceId: string): Promise<Result<Workspace, WorkspaceNotFoundError>> {
    const workspace = await this.workspaces.findById(UniqueEntityId.create(workspaceId));
    if (!workspace) {
      return Result.fail(new WorkspaceNotFoundError(workspaceId));
    }
    return Result.ok(workspace);
  }
}
