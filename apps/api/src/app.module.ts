import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";

import { validateEnv } from "./config/env.validation";
import { HealthModule } from "./health/health.module";
import { AgentModule } from "./modules/agent/agent.module";
import { ArtifactModule } from "./modules/artifact/artifact.module";
import { GoalModule } from "./modules/goal/goal.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { ResourceLockModule } from "./modules/resource-lock/resource-lock.module";
import { TaskModule } from "./modules/task/task.module";
import { WorkspaceModule } from "./modules/workspace/workspace.module";
import { KernelModule } from "./kernel/kernel.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RealtimeModule } from "./realtime/realtime.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // wildcard: lets RealtimeGateway subscribe once to "**" and relay every
    // domain event, instead of hard-coding a listener per event type.
    EventEmitterModule.forRoot({ wildcard: true, delimiter: "." }),
    KernelModule,
    PrismaModule,
    HealthModule,
    IdentityModule,
    WorkspaceModule,
    AgentModule,
    ResourceLockModule,
    RealtimeModule,
    GoalModule,
    TaskModule,
    ArtifactModule,
  ],
})
export class AppModule {}
