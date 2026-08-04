import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuditHealthProbe } from "../audit/infrastructure/audit-health.probe";
import { IdentityModule } from "../identity/identity.module";
import { LockModule } from "../lock/lock.module";
import { LockHealthProbe } from "../lock/infrastructure/lock-health.probe";
import { PolicyModule } from "../policy/policy.module";
import { TaskModule } from "../task/task.module";
import { TaskHealthProbe } from "../task/infrastructure/task-health.probe";
import { ValidationModule } from "../validation/validation.module";
import { ValidationHealthProbe } from "../validation/infrastructure/validation-health.probe";
import { AssessWorkspaceHealthUseCase } from "./application/assess-workspace-health.use-case";
import { HEALTH_PROBES } from "./domain/ports/health-probe.port";
import { ObservabilityController } from "./interface/observability.controller";

/**
 * The probe list is assembled here from adapters that live in the modules
 * they observe. Adding a probe later means exporting one more class — the
 * assessment code never changes (§1.4 of the module doc).
 */
@Module({
  imports: [
    IdentityModule,
    PolicyModule,
    LockModule,
    TaskModule,
    ValidationModule,
    AuditModule,
  ],
  controllers: [ObservabilityController],
  providers: [
    AssessWorkspaceHealthUseCase,
    {
      provide: HEALTH_PROBES,
      useFactory: (...probes: unknown[]) => probes,
      inject: [LockHealthProbe, TaskHealthProbe, ValidationHealthProbe, AuditHealthProbe],
    },
  ],
})
export class ObservabilityModule {}
