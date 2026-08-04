import { Module } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import {
  AdvanceSessionUseCase,
  AttachWorkerUseCase,
  RegisterWorkerUseCase,
  SetProviderAvailabilityUseCase,
  StartSessionUseCase,
  WorkerHeartbeatUseCase,
} from "./application/runtime.use-cases";
import {
  PROVIDER_STORE,
  SESSION_STORE,
  WORKER_STORE,
} from "./domain/ports/runtime.repository.port";
import { SessionHealthProbe } from "./infrastructure/session-health.probe";
import { WorkerHealthProbe } from "./infrastructure/worker-health.probe";
import {
  PrismaProviderStore,
  PrismaSessionStore,
  PrismaWorkerStore,
} from "./infrastructure/prisma-runtime.store";
import {
  RuntimeController,
  WorkspaceRuntimeController,
} from "./interface/runtime.controller";

/**
 * The registry and the arbiter (§6.9: "en cas de divergence, le Control Plane
 * fait autorité"). Execution lives in apps/worker, which cannot exist before
 * this module — it would have nowhere to register.
 *
 * The two health probes close what observability named as missing: §17.7's
 * Machine and Session.
 */
@Module({
  imports: [IdentityModule, WorkspaceModule],
  controllers: [RuntimeController, WorkspaceRuntimeController],
  providers: [
    { provide: WORKER_STORE, useClass: PrismaWorkerStore },
    { provide: SESSION_STORE, useClass: PrismaSessionStore },
    { provide: PROVIDER_STORE, useClass: PrismaProviderStore },
    RegisterWorkerUseCase,
    AttachWorkerUseCase,
    WorkerHeartbeatUseCase,
    StartSessionUseCase,
    AdvanceSessionUseCase,
    SetProviderAvailabilityUseCase,
    WorkerHealthProbe,
    SessionHealthProbe,
  ],
  exports: [WorkerHealthProbe, SessionHealthProbe],
})
export class RuntimeModule {}
