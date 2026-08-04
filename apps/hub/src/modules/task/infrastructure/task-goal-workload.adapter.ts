import { Global, Injectable, Module } from "@nestjs/common";

import { GOAL_WORKLOAD, GoalWorkloadPort } from "../../goal/domain/ports/goal-workload.port";
import {
  ACTOR_WORKLOAD,
  ActorWorkloadPort,
} from "../../identity/domain/ports/actor-workload.port";
import { ActorRef } from "../../identity/domain/actor";
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
 * Answers identity's "does this actor still own live work?" — the reason a
 * member cannot be removed while tasks are on their name.
 */
@Injectable()
export class TaskActorWorkloadAdapter implements ActorWorkloadPort {
  constructor(private readonly prisma: PrismaService) {}

  async hasOpenWork(actor: ActorRef, workspaceId: string): Promise<boolean> {
    const open = await this.prisma.task.count({
      where: {
        workspaceId,
        assigneeType: actor.type,
        assigneeId: actor.actorId,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
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
  providers: [
    { provide: GOAL_WORKLOAD, useClass: TaskGoalWorkloadAdapter },
    { provide: ACTOR_WORKLOAD, useClass: TaskActorWorkloadAdapter },
  ],
  exports: [GOAL_WORKLOAD, ACTOR_WORKLOAD],
})
export class WorkloadModule {}
