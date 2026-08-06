import { Module } from "@nestjs/common";

import { ArtifactModule } from "../artifact/artifact.module";
import { DecisionModule } from "../decision/decision.module";
import { IdentityModule } from "../identity/identity.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import {
  ForgetUseCase,
  GetMemoryEntryUseCase,
  ReadContextUseCase,
  RememberUseCase,
  SearchMemoryUseCase,
} from "./application/memory.use-cases";
import { ReconstructMemoryUseCase } from "./application/reconstruct-memory.use-case";
import { MEMORY_REPOSITORY } from "./domain/ports/memory.repository.port";
import { PrismaMemoryRepository } from "./infrastructure/prisma-memory.repository";
import { MemoryController } from "./interface/memory.controller";
import { RepositoryModule } from "../repository/repository.module";

/**
 * Imports decision and artifact for §16.10 reconstruction only — to READ what
 * they hold and pose references at it, never to copy it. No cycle: neither
 * knows this module exists.
 */
@Module({
  imports: [RepositoryModule, IdentityModule, WorkspaceModule, DecisionModule, ArtifactModule],
  controllers: [MemoryController],
  providers: [
    { provide: MEMORY_REPOSITORY, useClass: PrismaMemoryRepository },
    RememberUseCase,
    ForgetUseCase,
    GetMemoryEntryUseCase,
    ReadContextUseCase,
    SearchMemoryUseCase,
    ReconstructMemoryUseCase,
  ],
  // Exported for `AgentMemoryAdapter` (§16 into the agent's briefing): a
  // provider this module owns, needed by the adapter this module supplies.
  exports: [ReadContextUseCase],
})
export class MemoryModule {}
