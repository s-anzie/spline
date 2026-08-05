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
  COMMAND_STORE,
  ENROLMENT_STORE,
  PROVIDER_STORE,
  SESSION_STORE,
  WORKER_STORE,
} from "./domain/ports/runtime.repository.port";
import {
  ClaimCommandsUseCase,
  EnqueueCommandUseCase,
  ReportCommandUseCase,
  ResolveCommandSecretsUseCase,
} from "./application/command.use-cases";
import { DispatchTaskUseCase } from "./application/dispatch-task.use-case";
import { CommandHealthProbe } from "./infrastructure/command-health.probe";
import {
  ClaimEnrolmentUseCase,
  DecideEnrolmentUseCase,
  RequestEnrolmentUseCase,
} from "./application/enrolment.use-cases";
import {
  EnrolmentDecisionController,
  EnrolmentDoorController,
} from "./interface/enrolment.controller";
import { RecoverCrashedSessionsUseCase } from "./application/recover-crashed-sessions.use-case";
import { SessionHealthProbe } from "./infrastructure/session-health.probe";
import { WorkerHealthProbe } from "./infrastructure/worker-health.probe";
import {
  PrismaCommandStore,
  PrismaEnrolmentStore,
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
  controllers: [
    RuntimeController,
    WorkspaceRuntimeController,
    EnrolmentDoorController,
    EnrolmentDecisionController,
  ],
  providers: [
    { provide: WORKER_STORE, useClass: PrismaWorkerStore },
    { provide: SESSION_STORE, useClass: PrismaSessionStore },
    { provide: PROVIDER_STORE, useClass: PrismaProviderStore },
    { provide: COMMAND_STORE, useClass: PrismaCommandStore },
    { provide: ENROLMENT_STORE, useClass: PrismaEnrolmentStore },
    RequestEnrolmentUseCase,
    DecideEnrolmentUseCase,
    ClaimEnrolmentUseCase,
    DispatchTaskUseCase,
    RegisterWorkerUseCase,
    AttachWorkerUseCase,
    WorkerHeartbeatUseCase,
    StartSessionUseCase,
    AdvanceSessionUseCase,
    SetProviderAvailabilityUseCase,
    RecoverCrashedSessionsUseCase,
    EnqueueCommandUseCase,
    ClaimCommandsUseCase,
    ReportCommandUseCase,
    ResolveCommandSecretsUseCase,
    WorkerHealthProbe,
    SessionHealthProbe,
    CommandHealthProbe,
  ],
  exports: [WorkerHealthProbe, SessionHealthProbe, CommandHealthProbe],
})
export class RuntimeModule {}
