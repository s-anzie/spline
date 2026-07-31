import { Module } from "@nestjs/common";

import { WorkspaceModule } from "../workspace/workspace.module";
import { GetDecisionUseCase } from "./application/get-decision.use-case";
import { ListDecisionsByWorkspaceUseCase } from "./application/list-decisions-by-workspace.use-case";
import { RecordDecisionUseCase } from "./application/record-decision.use-case";
import { DECISION_REPOSITORY } from "./domain/ports/decision.repository.port";
import { PrismaDecisionRepository } from "./infrastructure/prisma-decision.repository";
import { DecisionController } from "./interface/decision.controller";

@Module({
  imports: [WorkspaceModule],
  controllers: [DecisionController],
  providers: [
    RecordDecisionUseCase,
    GetDecisionUseCase,
    ListDecisionsByWorkspaceUseCase,
    { provide: DECISION_REPOSITORY, useClass: PrismaDecisionRepository },
  ],
})
export class DecisionModule {}
