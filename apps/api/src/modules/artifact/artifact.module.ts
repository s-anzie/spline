import { Module } from "@nestjs/common";

import { GoalModule } from "../goal/goal.module";
import { TaskModule } from "../task/task.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { AddArtifactVersionUseCase } from "./application/add-artifact-version.use-case";
import { ArchiveArtifactUseCase } from "./application/archive-artifact.use-case";
import { CreateArtifactUseCase } from "./application/create-artifact.use-case";
import { DeleteArtifactUseCase } from "./application/delete-artifact.use-case";
import { GetArtifactUseCase } from "./application/get-artifact.use-case";
import { LinkArtifactUseCase } from "./application/link-artifact.use-case";
import { ListArtifactsUseCase } from "./application/list-artifacts.use-case";
import { UnlinkArtifactUseCase } from "./application/unlink-artifact.use-case";
import { UpdateArtifactMetadataUseCase } from "./application/update-artifact-metadata.use-case";
import { ARTIFACT_REPOSITORY } from "./domain/ports/artifact.repository.port";
import { PrismaArtifactRepository } from "./infrastructure/prisma-artifact.repository";
import { ArtifactController } from "./interface/artifact.controller";

@Module({
  imports: [WorkspaceModule, GoalModule, TaskModule],
  controllers: [ArtifactController],
  providers: [
    CreateArtifactUseCase,
    GetArtifactUseCase,
    ListArtifactsUseCase,
    UpdateArtifactMetadataUseCase,
    AddArtifactVersionUseCase,
    LinkArtifactUseCase,
    UnlinkArtifactUseCase,
    ArchiveArtifactUseCase,
    DeleteArtifactUseCase,
    { provide: ARTIFACT_REPOSITORY, useClass: PrismaArtifactRepository },
  ],
})
export class ArtifactModule {}
