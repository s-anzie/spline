import { Module } from "@nestjs/common";

import { GoalModule } from "../goal/goal.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { AssignTaskUseCase } from "./application/assign-task.use-case";
import { ChangeTaskStatusUseCase } from "./application/change-task-status.use-case";
import { CreateTaskUseCase } from "./application/create-task.use-case";
import { GetTaskUseCase } from "./application/get-task.use-case";
import { GoalProgressSyncService } from "./application/goal-progress-sync.service";
import { ListTasksByWorkspaceUseCase } from "./application/list-tasks-by-workspace.use-case";
import { RejectTaskUseCase } from "./application/reject-task.use-case";
import { ReportTaskBlockerUseCase } from "./application/report-task-blocker.use-case";
import { UpdateTaskDetailsUseCase } from "./application/update-task-details.use-case";
import { ValidateTaskUseCase } from "./application/validate-task.use-case";
import { TASK_REPOSITORY } from "./domain/ports/task.repository.port";
import { PrismaTaskRepository } from "./infrastructure/prisma-task.repository";
import { TaskController } from "./interface/task.controller";

@Module({
  imports: [WorkspaceModule, GoalModule],
  controllers: [TaskController],
  providers: [
    CreateTaskUseCase,
    GetTaskUseCase,
    ListTasksByWorkspaceUseCase,
    UpdateTaskDetailsUseCase,
    AssignTaskUseCase,
    ChangeTaskStatusUseCase,
    ValidateTaskUseCase,
    RejectTaskUseCase,
    ReportTaskBlockerUseCase,
    GoalProgressSyncService,
    { provide: TASK_REPOSITORY, useClass: PrismaTaskRepository },
  ],
  exports: [GetTaskUseCase],
})
export class TaskModule {}
