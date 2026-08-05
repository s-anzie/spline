import { Module } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module";
import { TaskModule } from "../task/task.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import {
  DecideMergeUseCase,
  RequestMergeUseCase,
} from "./application/merge.use-cases";
import { RepositoryReadService } from "./application/repository-read.service";
import {
  ArchiveWorktreeUseCase,
  OpenBranchUseCase,
  OpenWorktreeUseCase,
  RegisterRepositoryUseCase,
} from "./application/repository.use-cases";
import {
  BRANCH_STORE,
  MERGE_REQUEST_STORE,
  REPOSITORY_STORE,
  WORKTREE_STORE,
} from "./domain/ports/repository.repository.port";
import {
  PrismaBranchStore,
  PrismaMergeRequestStore,
  PrismaRepositoryStore,
  PrismaWorktreeStore,
} from "./infrastructure/prisma-repository.store";
import { RepositoryController } from "./interface/repository.controller";

/**
 * TASK_PROOF and AUDIT_TRAIL arrive from their global providers (validation
 * and audit): §8.7's "validations réussies" is the same question §11.7 asks,
 * and §18.7 audits "Merge". Neither is re-derived here.
 *
 * Nothing else in the system imports this module — §26: a workspace works
 * fully without any repository.
 */
@Module({
  imports: [IdentityModule, WorkspaceModule, TaskModule],
  controllers: [RepositoryController],
  providers: [
    { provide: REPOSITORY_STORE, useClass: PrismaRepositoryStore },
    { provide: BRANCH_STORE, useClass: PrismaBranchStore },
    { provide: WORKTREE_STORE, useClass: PrismaWorktreeStore },
    { provide: MERGE_REQUEST_STORE, useClass: PrismaMergeRequestStore },
    RegisterRepositoryUseCase,
    OpenBranchUseCase,
    OpenWorktreeUseCase,
    ArchiveWorktreeUseCase,
    RequestMergeUseCase,
    DecideMergeUseCase,
    RepositoryReadService,
  ],
  // Read-only access for the two modules that need to know a repository
  // exists: artifact validates a link against it, memory rebuilds from it.
  exports: [REPOSITORY_STORE],
})
export class RepositoryModule {}
