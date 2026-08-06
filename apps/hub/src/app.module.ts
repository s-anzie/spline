import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { validateEnv } from "./config/env.validation";
import { globalThrottleLimit, throttleTtlMs } from "./config/hardening";
import { HealthModule } from "./health/health.module";
import { UnitOfWork } from "./kernel/infrastructure/unit-of-work";
import { TransactionInterceptor } from "./kernel/interface/transaction.interceptor";
import { KernelModule } from "./kernel/kernel.module";
import { AuditModule } from "./modules/audit/audit.module";
import { ArtifactModule } from "./modules/artifact/artifact.module";
import { ConversationModule } from "./modules/conversation/conversation.module";
import { DecisionModule } from "./modules/decision/decision.module";
import { EventModule } from "./modules/event/event.module";
import { ExecutionModule } from "./modules/execution/execution.module";
import { TaskRetryModule } from "./modules/task/infrastructure/task-retry.adapter";
import { PreemptableTasksModule } from "./modules/task/infrastructure/preemptable-tasks.adapter";
import { ActiveRunsModule } from "./modules/execution/infrastructure/active-runs.adapter";
import { RunLedgerModule } from "./modules/execution/infrastructure/run-ledger.adapter";
import { AgentMemoryModule } from "./modules/memory/infrastructure/agent-memory.adapter";
import { OrganizationFleetModule } from "./modules/identity/infrastructure/organization-fleet.adapter";
import { DispatchableTaskModule } from "./modules/task/infrastructure/dispatchable-task.adapter";
import { ReclaimableLeasesModule } from "./modules/lock/infrastructure/reclaimable-leases.adapter";
import { GoalModule } from "./modules/goal/goal.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { NotificationModule } from "./modules/notification/notification.module";
import { WorkloadModule } from "./modules/task/infrastructure/task-goal-workload.adapter";
import { TaskModule } from "./modules/task/task.module";
import { RuntimeModule } from "./modules/runtime/runtime.module";
import { SchedulingModule } from "./modules/scheduling/scheduling.module";
import { RepositoryModule } from "./modules/repository/repository.module";
import { ObservabilityModule } from "./modules/observability/observability.module";
import { MemoryModule } from "./modules/memory/memory.module";
import { LockModule } from "./modules/lock/lock.module";
import { PolicyModule } from "./modules/policy/policy.module";
import { SecretModule } from "./modules/secret/secret.module";
import { ValidationModule } from "./modules/validation/validation.module";
import { WorkspaceModule } from "./modules/workspace/workspace.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // wildcard: lets realtime relays subscribe once to "**" and forward every
    // domain event, instead of hard-coding a listener per event type.
    EventEmitterModule.forRoot({ wildcard: true, delimiter: "." }),
    /**
     * §18 — nothing stood between a caller and a million password attempts
     * against /auth/login. The ceiling declared here applies to every route;
     * the routes that guess a secret narrow it themselves with `@Throttle`.
     */
    ThrottlerModule.forRoot([{ ttl: throttleTtlMs(), limit: globalThrottleLimit() }]),
    KernelModule,
    PrismaModule,
    HealthModule,
    IdentityModule,
    AuditModule,
    WorkspaceModule,
    GoalModule,
    TaskModule,
    TaskRetryModule,
    ExecutionModule,
    PreemptableTasksModule,
    ActiveRunsModule,
    RunLedgerModule,
    AgentMemoryModule,
    OrganizationFleetModule,
    DispatchableTaskModule,
    ReclaimableLeasesModule,
    ArtifactModule,
    DecisionModule,
    ConversationModule,
    EventModule,
    NotificationModule,
    PolicyModule,
    SecretModule,
    LockModule,
    MemoryModule,
    ObservabilityModule,
    RepositoryModule,
    SchedulingModule,
    RuntimeModule,
    ValidationModule,
    WorkloadModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    /**
     * §14.1 — one request that changes something, one transaction. Registered
     * globally rather than per controller: a controller that forgot it would
     * write outside the transaction silently, and silently is how the gap
     * this closes survived being documented.
     */
    UnitOfWork,
    { provide: APP_INTERCEPTOR, useClass: TransactionInterceptor },
  ],
})
export class AppModule {}
