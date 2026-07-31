import { Module } from "@nestjs/common";

import { WorkspaceModule } from "../workspace/workspace.module";
import { ChangeGoalStatusUseCase } from "./application/change-goal-status.use-case";
import { CreateGoalUseCase } from "./application/create-goal.use-case";
import { GetGoalUseCase } from "./application/get-goal.use-case";
import { ListGoalsByWorkspaceUseCase } from "./application/list-goals-by-workspace.use-case";
import { RecalculateGoalProgressUseCase } from "./application/recalculate-goal-progress.use-case";
import { RejectGoalUseCase } from "./application/reject-goal.use-case";
import { ReportGoalBlockerUseCase } from "./application/report-goal-blocker.use-case";
import { UpdateGoalDetailsUseCase } from "./application/update-goal-details.use-case";
import { ValidateGoalUseCase } from "./application/validate-goal.use-case";
import { GOAL_REPOSITORY } from "./domain/ports/goal.repository.port";
import { PrismaGoalRepository } from "./infrastructure/prisma-goal.repository";
import { GoalController } from "./interface/goal.controller";

@Module({
  imports: [WorkspaceModule],
  controllers: [GoalController],
  providers: [
    CreateGoalUseCase,
    GetGoalUseCase,
    ListGoalsByWorkspaceUseCase,
    UpdateGoalDetailsUseCase,
    ChangeGoalStatusUseCase,
    RecalculateGoalProgressUseCase,
    ValidateGoalUseCase,
    RejectGoalUseCase,
    ReportGoalBlockerUseCase,
    { provide: GOAL_REPOSITORY, useClass: PrismaGoalRepository },
  ],
  exports: [GetGoalUseCase, RecalculateGoalProgressUseCase],
})
export class GoalModule {}
