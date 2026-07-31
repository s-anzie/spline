import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { WORKSPACE_REPOSITORY, WorkspaceRepository } from "../domain/ports/workspace.repository.port";
import { Workspace } from "../domain/workspace";
import { WorkspaceArchivedError } from "../domain/workspace.errors";
import { WorkspaceNotFoundError } from "./workspace-application.errors";

export interface UpdateWorkspaceRulesetInput {
  workspaceId: string;
  ruleset: Record<string, unknown>;
}

export type UpdateWorkspaceRulesetError = WorkspaceNotFoundError | WorkspaceArchivedError;

@Injectable()
export class UpdateWorkspaceRulesetUseCase {
  constructor(@Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository) {}

  async execute(
    input: UpdateWorkspaceRulesetInput,
  ): Promise<Result<Workspace, UpdateWorkspaceRulesetError>> {
    const workspace = await this.workspaces.findById(UniqueEntityId.create(input.workspaceId));
    if (!workspace) {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }

    try {
      workspace.updateRuleset(input.ruleset);
    } catch (error) {
      if (error instanceof WorkspaceArchivedError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.workspaces.save(workspace);
    return Result.ok(workspace);
  }
}
