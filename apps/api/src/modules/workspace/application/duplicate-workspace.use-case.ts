import { ActorType, WorkspaceRole } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { AssignWorkspaceRoleUseCase } from "../../identity/application/assign-workspace-role.use-case";
import { WORKSPACE_REPOSITORY, WorkspaceRepository } from "../domain/ports/workspace.repository.port";
import { Workspace } from "../domain/workspace";
import { WorkspaceNotFoundError } from "./workspace-application.errors";

export interface DuplicateWorkspaceInput {
  workspaceId: string;
  newName: string;
  ownerId: string;
}

@Injectable()
export class DuplicateWorkspaceUseCase {
  constructor(
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    private readonly assignWorkspaceRole: AssignWorkspaceRoleUseCase,
  ) {}

  async execute(input: DuplicateWorkspaceInput): Promise<Result<Workspace, WorkspaceNotFoundError>> {
    const source = await this.workspaces.findById(UniqueEntityId.create(input.workspaceId));
    if (!source) {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }

    const copy = source.duplicate(input.newName);
    await this.workspaces.save(copy);
    await this.assignWorkspaceRole.execute({
      workspaceId: copy.id.toString(),
      actorType: ActorType.HUMAN,
      actorId: input.ownerId,
      role: WorkspaceRole.OWNER,
    });

    return Result.ok(copy);
  }
}
