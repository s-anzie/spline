import { Module } from "@nestjs/common";

import { GoalModule } from "../goal/goal.module";
import { IdentityModule } from "../identity/identity.module";
import { TaskModule } from "../task/task.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { AddArtifactVersionUseCase } from "./application/add-artifact-version.use-case";
import { ArtifactLinkTargets } from "./application/artifact-link-targets.service";
import { ChangeArtifactStatusUseCase } from "./application/change-artifact-status.use-case";
import { CreateArtifactUseCase } from "./application/create-artifact.use-case";
import { GetArtifactUseCase } from "./application/get-artifact.use-case";
import { LinkArtifactUseCase } from "./application/link-artifact.use-case";
import { ListArtifactsUseCase } from "./application/list-artifacts.use-case";
import { UpdateArtifactMetadataUseCase } from "./application/update-artifact-metadata.use-case";
import { ARTIFACT_REPOSITORY } from "./domain/ports/artifact.repository.port";
import { PrismaArtifactRepository } from "./infrastructure/prisma-artifact.repository";
import { ArtifactController } from "./interface/artifact.controller";

@Module({
  imports: [IdentityModule, WorkspaceModule, GoalModule, TaskModule],
  controllers: [ArtifactController],
  providers: [
    { provide: ARTIFACT_REPOSITORY, useClass: PrismaArtifactRepository },
    ArtifactLinkTargets,
    CreateArtifactUseCase,
    AddArtifactVersionUseCase,
    GetArtifactUseCase,
    ListArtifactsUseCase,
    UpdateArtifactMetadataUseCase,
    LinkArtifactUseCase,
    ChangeArtifactStatusUseCase,
  ],
  exports: [ARTIFACT_REPOSITORY, CreateArtifactUseCase, GetArtifactUseCase],
})
export class ArtifactModule {}
