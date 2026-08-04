import { Module } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module";
import { PolicyModule } from "../policy/policy.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { AcquireLockUseCase } from "./application/acquire-lock.use-case";
import {
  GetLockUseCase,
  ListLocksUseCase,
} from "./application/list-locks.use-case";
import { ManageLockUseCase } from "./application/manage-lock.use-case";
import { LOCK_REPOSITORY } from "./domain/ports/lock.repository.port";
import { PrismaLockRepository } from "./infrastructure/prisma-lock.repository";
import { LockController } from "./interface/lock.controller";

/** LOCK_TTL_POLICY is supplied by PolicyModule — lock/ never imports policy/. */
@Module({
  imports: [IdentityModule, WorkspaceModule, PolicyModule],
  controllers: [LockController],
  providers: [
    { provide: LOCK_REPOSITORY, useClass: PrismaLockRepository },
    AcquireLockUseCase,
    ManageLockUseCase,
    ListLocksUseCase,
    GetLockUseCase,
  ],
})
export class LockModule {}
