import { Module } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module";
import { TaskModule } from "../task/task.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { GetDecisionUseCase } from "./application/get-decision.use-case";
import { ListDecisionsUseCase } from "./application/list-decisions.use-case";
import { RecordDecisionUseCase } from "./application/record-decision.use-case";
import { SupersedeDecisionUseCase } from "./application/supersede-decision.use-case";
import { DECISION_REPOSITORY } from "./domain/ports/decision.repository.port";
import { PrismaDecisionRepository } from "./infrastructure/prisma-decision.repository";
import { DecisionController } from "./interface/decision.controller";

@Module({
  imports: [IdentityModule, WorkspaceModule, TaskModule],
  controllers: [DecisionController],
  providers: [
    { provide: DECISION_REPOSITORY, useClass: PrismaDecisionRepository },
    RecordDecisionUseCase,
    SupersedeDecisionUseCase,
    GetDecisionUseCase,
    ListDecisionsUseCase,
  ],
  exports: [DECISION_REPOSITORY, RecordDecisionUseCase, GetDecisionUseCase],
})
export class DecisionModule {}
