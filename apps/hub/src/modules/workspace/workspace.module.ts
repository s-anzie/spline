import { Module } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module";
import { ChangeWorkspaceStatusUseCase } from "./application/change-workspace-status.use-case";
import { CreateWorkspaceUseCase } from "./application/create-workspace.use-case";
import { GetWorkspaceUseCase } from "./application/get-workspace.use-case";
import { ListWorkspacesForActorUseCase } from "./application/list-workspaces-for-actor.use-case";
import { UpdateWorkspaceDetailsUseCase } from "./application/update-workspace-details.use-case";
import { WORKSPACE_REPOSITORY } from "./domain/ports/workspace.repository.port";
import { PrismaWorkspaceRepository } from "./infrastructure/prisma-workspace.repository";
import { WorkspaceController } from "./interface/workspace.controller";

@Module({
  imports: [IdentityModule],
  controllers: [WorkspaceController],
  providers: [
    { provide: WORKSPACE_REPOSITORY, useClass: PrismaWorkspaceRepository },
    CreateWorkspaceUseCase,
    GetWorkspaceUseCase,
    ListWorkspacesForActorUseCase,
    UpdateWorkspaceDetailsUseCase,
    ChangeWorkspaceStatusUseCase,
  ],
  exports: [WORKSPACE_REPOSITORY, GetWorkspaceUseCase],
})
export class WorkspaceModule {}
