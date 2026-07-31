import { Module } from "@nestjs/common";

import { WorkspaceModule } from "../workspace/workspace.module";
import { AcquireLockUseCase } from "./application/acquire-lock.use-case";
import { ListLocksByWorkspaceUseCase } from "./application/list-locks-by-workspace.use-case";
import { ReleaseLockUseCase } from "./application/release-lock.use-case";
import { RESOURCE_LOCK_REPOSITORY } from "./domain/ports/resource-lock.repository.port";
import { PrismaResourceLockRepository } from "./infrastructure/prisma-resource-lock.repository";
import { ResourceLockController } from "./interface/resource-lock.controller";

@Module({
  imports: [WorkspaceModule],
  controllers: [ResourceLockController],
  providers: [
    AcquireLockUseCase,
    ReleaseLockUseCase,
    ListLocksByWorkspaceUseCase,
    { provide: RESOURCE_LOCK_REPOSITORY, useClass: PrismaResourceLockRepository },
  ],
})
export class ResourceLockModule {}
