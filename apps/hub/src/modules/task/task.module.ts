import { Module } from "@nestjs/common";

import { GoalModule } from "../goal/goal.module";
import { IdentityModule } from "../identity/identity.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { AssignTaskUseCase } from "./application/assign-task.use-case";
import { CancelTasksOnGoalCancelledListener } from "./application/cancel-tasks-on-goal-cancelled.listener";
import { ChangeTaskStatusUseCase } from "./application/change-task-status.use-case";
import { CompleteTaskUseCase } from "./application/complete-task.use-case";
import { CreateTaskUseCase } from "./application/create-task.use-case";
import { GetTaskUseCase } from "./application/get-task.use-case";
import { GoalProgressSyncService } from "./application/goal-progress-sync.service";
import { ListTasksUseCase } from "./application/list-tasks.use-case";
import { ManageTaskDependencyUseCase } from "./application/manage-task-dependency.use-case";
import { ReportBlockerUseCase } from "./application/report-blocker.use-case";
import { ResolveBlockerUseCase } from "./application/resolve-blocker.use-case";
import { UpdateTaskDetailsUseCase } from "./application/update-task-details.use-case";
import { TASK_REPOSITORY } from "./domain/ports/task.repository.port";
import { PrismaTaskRepository } from "./infrastructure/prisma-task.repository";
import { TaskController } from "./interface/task.controller";
import { TaskHealthProbe } from "./infrastructure/task-health.probe";
import { ReleaseTaskOnSessionCrashedListener } from "./application/release-task-on-session-crashed.listener";

@Module({
  imports: [IdentityModule, WorkspaceModule, GoalModule],
  controllers: [TaskController],
  providers: [
    ReleaseTaskOnSessionCrashedListener,
    TaskHealthProbe,
    { provide: TASK_REPOSITORY, useClass: PrismaTaskRepository },
    CreateTaskUseCase,
    GetTaskUseCase,
    ListTasksUseCase,
    UpdateTaskDetailsUseCase,
    AssignTaskUseCase,
    ChangeTaskStatusUseCase,
    CompleteTaskUseCase,
    ReportBlockerUseCase,
    ResolveBlockerUseCase,
    ManageTaskDependencyUseCase,
    GoalProgressSyncService,
    CancelTasksOnGoalCancelledListener,
  ],
  exports: [
    TaskHealthProbe,
    TASK_REPOSITORY,
    GetTaskUseCase,
    // For `WorkIntakeAdapter` (§4.5): a need handed to a manager becomes a
    // task, and only this module knows how to make one correctly.
    CreateTaskUseCase,
    // …and READY, or nothing could ever dispatch it.
    ChangeTaskStatusUseCase,
  ],
})
export class TaskModule {}
