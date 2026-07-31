import { ActorType } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { PermissionsService } from "../../identity/application/permissions.service";
import { WORKSPACE_REPOSITORY, WorkspaceRepository } from "../domain/ports/workspace.repository.port";
import { Workspace } from "../domain/workspace";

@Injectable()
export class ListWorkspacesUseCase {
  constructor(
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    private readonly permissionsService: PermissionsService,
  ) {}

  async execute(actorType: ActorType, actorId: string): Promise<Workspace[]> {
    const workspaceIds = await this.permissionsService.listAccessibleWorkspaceIds(
      actorType,
      actorId,
    );
    if (workspaceIds.length === 0) {
      return [];
    }
    return this.workspaces.findByIds(workspaceIds);
  }
}
