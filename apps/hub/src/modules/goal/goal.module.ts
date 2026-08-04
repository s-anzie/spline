import { Module } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { ChangeGoalStatusUseCase } from "./application/change-goal-status.use-case";
import { CompleteGoalUseCase } from "./application/complete-goal.use-case";
import { CreateGoalUseCase } from "./application/create-goal.use-case";
import { GetGoalUseCase } from "./application/get-goal.use-case";
import { ManageGoalDependencyUseCase } from "./application/manage-goal-dependency.use-case";
import { ListGoalsUseCase } from "./application/list-goals.use-case";
import { UpdateGoalDetailsUseCase } from "./application/update-goal-details.use-case";
import { UpdateGoalProgressUseCase } from "./application/update-goal-progress.use-case";
import { GOAL_REPOSITORY } from "./domain/ports/goal.repository.port";
import { PrismaGoalRepository } from "./infrastructure/prisma-goal.repository";
import { GoalController } from "./interface/goal.controller";

@Module({
  imports: [IdentityModule, WorkspaceModule],
  controllers: [GoalController],
  providers: [
    { provide: GOAL_REPOSITORY, useClass: PrismaGoalRepository },
    CreateGoalUseCase,
    GetGoalUseCase,
    ListGoalsUseCase,
    UpdateGoalDetailsUseCase,
    ChangeGoalStatusUseCase,
    CompleteGoalUseCase,
    UpdateGoalProgressUseCase,
    ManageGoalDependencyUseCase,
  ],
  exports: [GOAL_REPOSITORY, UpdateGoalProgressUseCase, GetGoalUseCase],
})
export class GoalModule {}
