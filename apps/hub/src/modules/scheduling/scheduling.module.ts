import { GetCheckInsDueUseCase } from "./application/schedule.use-cases";
import { PreemptForTaskUseCase } from "./application/preempt.use-case";
import { Module } from "@nestjs/common";

import { GoalModule } from "../goal/goal.module";
import { IdentityModule } from "../identity/identity.module";
import { TaskModule } from "../task/task.module";
import {
  GetNextForActorUseCase,
  GetScheduleUseCase,
} from "./application/schedule.use-cases";
import { SchedulingController } from "./interface/scheduling.controller";

/**
 * Read-only, and it stores nothing: a schedule is a conclusion about the
 * current state of tasks, recomputable at any moment. Keeping one would
 * create a second truth that ages.
 */
@Module({
  imports: [IdentityModule, TaskModule, GoalModule],
  controllers: [SchedulingController],
  providers: [
    PreemptForTaskUseCase,
    GetCheckInsDueUseCase,GetScheduleUseCase, GetNextForActorUseCase],
})
export class SchedulingModule {}
