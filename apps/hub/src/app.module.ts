import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";

import { validateEnv } from "./config/env.validation";
import { HealthModule } from "./health/health.module";
import { KernelModule } from "./kernel/kernel.module";
import { AuditModule } from "./modules/audit/audit.module";
import { ArtifactModule } from "./modules/artifact/artifact.module";
import { DecisionModule } from "./modules/decision/decision.module";
import { EventModule } from "./modules/event/event.module";
import { GoalModule } from "./modules/goal/goal.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { NotificationModule } from "./modules/notification/notification.module";
import { WorkloadModule } from "./modules/task/infrastructure/task-goal-workload.adapter";
import { TaskModule } from "./modules/task/task.module";
import { SchedulingModule } from "./modules/scheduling/scheduling.module";
import { RepositoryModule } from "./modules/repository/repository.module";
import { ObservabilityModule } from "./modules/observability/observability.module";
import { MemoryModule } from "./modules/memory/memory.module";
import { LockModule } from "./modules/lock/lock.module";
import { PolicyModule } from "./modules/policy/policy.module";
import { ValidationModule } from "./modules/validation/validation.module";
import { WorkspaceModule } from "./modules/workspace/workspace.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // wildcard: lets realtime relays subscribe once to "**" and forward every
    // domain event, instead of hard-coding a listener per event type.
    EventEmitterModule.forRoot({ wildcard: true, delimiter: "." }),
    KernelModule,
    PrismaModule,
    HealthModule,
    IdentityModule,
    AuditModule,
    WorkspaceModule,
    GoalModule,
    TaskModule,
    ArtifactModule,
    DecisionModule,
    EventModule,
    NotificationModule,
    PolicyModule,
    LockModule,
    MemoryModule,
    ObservabilityModule,
    RepositoryModule,
    SchedulingModule,
    ValidationModule,
    WorkloadModule,
  ],
})
export class AppModule {}
