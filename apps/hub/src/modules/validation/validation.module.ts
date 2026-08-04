import { Global, Module } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module";
import { PolicyModule } from "../policy/policy.module";
import { TASK_PROOF } from "../task/domain/ports/task-proof.port";
import { TaskModule } from "../task/task.module";
import { InvalidateValidationsUseCase } from "./application/invalidate-validations.use-case";
import { ListValidationsUseCase } from "./application/list-validations.use-case";
import { RequestValidationUseCase } from "./application/request-validation.use-case";
import { SettleValidationUseCase } from "./application/settle-validation.use-case";
import { VALIDATION_REPOSITORY } from "./domain/ports/validation.repository.port";
import { PrismaValidationRepository } from "./infrastructure/prisma-validation.repository";
import { ValidationTaskProofAdapter } from "./infrastructure/validation-task-proof.adapter";
import { ValidationController } from "./interface/validation.controller";

/**
 * @Global for TASK_PROOF only, and for the reason learnt twice already
 * (GOAL_WORKLOAD, then EVENT_PUBLISHER): Nest resolves a provider's tokens
 * inside its OWN module, so a binding declared here would never reach
 * CompleteTaskUseCase in TaskModule — and TaskModule cannot import this one
 * without closing a cycle.
 */
@Global()
@Module({
  imports: [IdentityModule, TaskModule, PolicyModule],
  controllers: [ValidationController],
  providers: [
    { provide: VALIDATION_REPOSITORY, useClass: PrismaValidationRepository },
    { provide: TASK_PROOF, useClass: ValidationTaskProofAdapter },
    RequestValidationUseCase,
    SettleValidationUseCase,
    ListValidationsUseCase,
    InvalidateValidationsUseCase,
  ],
  exports: [TASK_PROOF, RequestValidationUseCase],
})
export class ValidationModule {}
