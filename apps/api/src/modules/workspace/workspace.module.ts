import { Inject, Module, OnModuleInit } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module";
import { ArchiveWorkspaceUseCase } from "./application/archive-workspace.use-case";
import { CreateWorkspaceUseCase } from "./application/create-workspace.use-case";
import { DuplicateWorkspaceUseCase } from "./application/duplicate-workspace.use-case";
import { GetWorkspaceUseCase } from "./application/get-workspace.use-case";
import { ListWorkspacesUseCase } from "./application/list-workspaces.use-case";
import { RenameWorkspaceUseCase } from "./application/rename-workspace.use-case";
import { SetWorkspaceRootPathUseCase } from "./application/set-workspace-root-path.use-case";
import { UpdateWorkspaceRulesetUseCase } from "./application/update-workspace-ruleset.use-case";
import { WORKSPACE_REPOSITORY } from "./domain/ports/workspace.repository.port";
import type { WorkspaceRepository } from "./domain/ports/workspace.repository.port";
import {
  withDefaultWorkspaceRuleset,
  workspaceRulesetNeedsBackfill,
} from "./application/default-workspace-ruleset";
import { PrismaWorkspaceRepository } from "./infrastructure/prisma-workspace.repository";
import { WorkspaceController } from "./interface/workspace.controller";

@Module({
  imports: [IdentityModule],
  controllers: [WorkspaceController],
  providers: [
    CreateWorkspaceUseCase,
    RenameWorkspaceUseCase,
    ArchiveWorkspaceUseCase,
    DuplicateWorkspaceUseCase,
    GetWorkspaceUseCase,
    ListWorkspacesUseCase,
    UpdateWorkspaceRulesetUseCase,
    SetWorkspaceRootPathUseCase,
    { provide: WORKSPACE_REPOSITORY, useClass: PrismaWorkspaceRepository },
  ],
  exports: [GetWorkspaceUseCase],
})
export class WorkspaceModule implements OnModuleInit {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspaces: WorkspaceRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const workspace of await this.workspaces.listAll()) {
      if (
        workspace.isArchived ||
        !workspaceRulesetNeedsBackfill(workspace.ruleset)
      )
        continue;
      workspace.updateRuleset(withDefaultWorkspaceRuleset(workspace.ruleset));
      await this.workspaces.save(workspace);
    }
  }
}
