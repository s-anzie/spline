import { Module } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module";
import { TaskModule } from "../task/task.module";
import {
  BeginAttemptUseCase,
  CheckResumableUseCase,
  FinishAttemptUseCase,
  RetryTaskUseCase,
  StartRunUseCase,
  SweepOverrunRunsUseCase,
} from "./application/run.use-cases";
import { RUN_REPOSITORY } from "./domain/ports/run.repository.port";
import { PrismaRunRepository } from "./infrastructure/prisma-run.repository";
import { ExecutionController } from "./interface/execution.controller";

/**
 * §4.7-4.8, §9.12-9.13 — the execution history of a task.
 *
 * It imports the task module for its guards, never for its repository: what a
 * retry may follow is decided behind the `RETRYABLE_TASK` port, which this
 * module DECLARES and the task module supplies.
 */
@Module({
  imports: [IdentityModule, TaskModule],
  controllers: [ExecutionController],
  providers: [
    { provide: RUN_REPOSITORY, useClass: PrismaRunRepository },
    StartRunUseCase,
    RetryTaskUseCase,
    BeginAttemptUseCase,
    FinishAttemptUseCase,
    CheckResumableUseCase,
    SweepOverrunRunsUseCase,
  ],
  exports: [RUN_REPOSITORY, StartRunUseCase],
})
export class ExecutionModule {}
