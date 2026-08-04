import { Global, Injectable, Module } from "@nestjs/common";

import { GOAL_WORKLOAD, GoalWorkloadPort } from "../../goal/domain/ports/goal-workload.port";
import { PrismaService } from "../../../prisma/prisma.service";

/**
 * Supplies the goal module's own abstraction (§DIP): the goal owns the rule
 * "not complete while work is open", the task side knows the facts. Reads
 * Prisma directly — it is an infrastructure adapter answering one count, and
 * depending on the task repository would drag TaskModule into GoalModule's
 * injector.
 */
@Injectable()
export class TaskGoalWorkloadAdapter implements GoalWorkloadPort {
  constructor(private readonly prisma: PrismaService) {}

  async hasOpenTasks(goalId: string): Promise<boolean> {
    // Cancelled tasks will never complete, so they must not hold a goal open.
    const open = await this.prisma.task.count({
      where: { goalId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    });
    return open > 0;
  }
}

/**
 * Global on purpose. Nest resolves a provider's tokens inside its own module,
 * so a binding declared in TaskModule would never reach CompleteGoalUseCase,
 * which lives in GoalModule — and having GoalModule import TaskModule would
 * close a cycle (TaskModule already imports GoalModule). A global binding is
 * the one wiring that satisfies both directions without forwardRef.
 */
@Global()
@Module({
  providers: [{ provide: GOAL_WORKLOAD, useClass: TaskGoalWorkloadAdapter }],
  exports: [GOAL_WORKLOAD],
})
export class GoalWorkloadModule {}
