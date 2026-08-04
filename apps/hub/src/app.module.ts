import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";

import { validateEnv } from "./config/env.validation";
import { HealthModule } from "./health/health.module";
import { KernelModule } from "./kernel/kernel.module";
import { GoalModule } from "./modules/goal/goal.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { GoalWorkloadModule } from "./modules/task/infrastructure/task-goal-workload.adapter";
import { TaskModule } from "./modules/task/task.module";
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
    WorkspaceModule,
    GoalModule,
    TaskModule,
    GoalWorkloadModule,
  ],
})
export class AppModule {}
