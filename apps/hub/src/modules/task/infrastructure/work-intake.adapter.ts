import { Global, Injectable, Module } from "@nestjs/common";

import { DomainError } from "../../../kernel/domain/domain-error";
import { Result } from "../../../kernel/domain/result";
import {
  WORK_INTAKE,
  WorkIntake,
} from "../../conversation/domain/ports/work-intake.port";
import { GoalModule } from "../../goal/goal.module";
import { EnsureRequestsGoalUseCase } from "../../goal/application/ensure-requests-goal.use-case";
import { ActorRef } from "../../identity/domain/actor";
import { IdentityModule } from "../../identity/identity.module";
import { PermissionsService } from "../../identity/application/permissions.service";
import { CreateTaskUseCase } from "../application/create-task.use-case";
import { TaskModule } from "../task.module";

/** §4.6 — organising is a permission, and it is checked before anything is made. */
export class CannotOrganiseError extends DomainError {
  constructor(actorId: string) {
    super(
      `"${actorId}" cannot organise work in this workspace, so a need cannot ` +
        "be handed to them. Give them the manager role first, or ask them a " +
        "question instead (§4.6)",
    );
  }
}

/**
 * §4.5, §4.6 — the need becomes a task the manager holds.
 *
 * Two rules meet here and the resolution is the whole point. A task must
 * serve a goal, and a goal must state what would prove it reached. A person
 * writing "improve the document creation flow" has stated neither — so the
 * hub cannot mint the goal without inventing criteria on their behalf, and
 * words the system then treats as theirs.
 *
 * The need is therefore a TASK, under the workspace's standing requests goal,
 * and stating the real goal is the manager's first act. What was asked for
 * and what the team decided it means stay visibly separate, which is what
 * lets somebody disagree with the second without re-typing the first.
 *
 * The need is carried through unedited. A summary written by the hub is a
 * summary the manager would work from instead of the words that were used.
 */
@Injectable()
export class WorkIntakeAdapter implements WorkIntake {
  constructor(
    private readonly requestsGoal: EnsureRequestsGoalUseCase,
    private readonly createTask: CreateTaskUseCase,
    private readonly permissions: PermissionsService,
  ) {}

  async openRequest(input: {
    workspaceId: string;
    need: string;
    manager: ActorRef;
    asker: ActorRef;
  }): Promise<Result<{ taskId: string }, DomainError>> {
    const canOrganise = await this.permissions.can(
      { actorType: input.manager.type, actorId: input.manager.actorId },
      "manage_tasks",
      input.workspaceId,
    );
    if (!canOrganise) {
      return Result.fail(new CannotOrganiseError(input.manager.actorId));
    }

    const goal = await this.requestsGoal.execute({
      workspaceId: input.workspaceId,
      owner: input.asker,
    });

    const created = await this.createTask.execute({
      workspaceId: input.workspaceId,
      goalId: goal.value.goalId,
      // A title has to fit a list; the need has to survive whole. So the
      // first line titles it and the whole thing is the description — the
      // manager reads the description, a person scanning reads the title.
      title: firstLine(input.need),
      description: input.need,
      acceptanceCriteria: [
        "this need has been turned into a goal and tasks, or answered with why it cannot be",
      ],
      assigneeType: input.manager.type,
      assigneeId: input.manager.actorId,
    });
    if (created.isFailure) {
      return Result.fail(created.error as DomainError);
    }
    return Result.ok({ taskId: created.value.taskId });
  }
}

/** Titles are read in a column; 90 characters is what fits before it truncates. */
function firstLine(need: string): string {
  const line = need.trim().split(/\r?\n/)[0] ?? need.trim();
  return line.length <= 90 ? line : `${line.slice(0, 89).trimEnd()}…`;
}

/** Global, and importing what it borrows: see the note in kernel/doc.md. */
@Global()
@Module({
  imports: [GoalModule, TaskModule, IdentityModule],
  providers: [WorkIntakeAdapter, { provide: WORK_INTAKE, useExisting: WorkIntakeAdapter }],
  exports: [WORK_INTAKE],
})
export class WorkIntakeModule {}
