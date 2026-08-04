import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Result } from "../../../kernel/domain/result";
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../domain/ports/workspace.repository.port";
import { Workspace } from "../domain/workspace";
import { WorkspaceNotFoundError } from "../domain/workspace.errors";

export interface GetWorkspaceInput {
  workspaceId: string;
}

@Injectable()
export class GetWorkspaceUseCase
  implements UseCase<GetWorkspaceInput, Result<Workspace, WorkspaceNotFoundError>>
{
  constructor(
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
  ) {}

  async execute(
    input: GetWorkspaceInput,
  ): Promise<Result<Workspace, WorkspaceNotFoundError>> {
    const workspace = await this.workspaces.findById(input.workspaceId);
    // A logically deleted workspace is indistinguishable from an unknown one.
    if (!workspace || workspace.status === "DELETED") {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }
    return Result.ok(workspace);
  }
}
