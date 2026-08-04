import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { TASK_REPOSITORY, TaskRepository } from "../../task/domain/ports/task.repository.port";
import { TaskNotFoundError } from "../../task/domain/task.errors";
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../../workspace/domain/ports/workspace.repository.port";
import {
  WorkspaceNotActiveError,
  WorkspaceNotFoundError,
} from "../../workspace/domain/workspace.errors";
import { ConsideredAlternative } from "../domain/considered-alternative";
import { Decision, DecisionConfidence } from "../domain/decision";
import {
  DECISION_REPOSITORY,
  DecisionRepository,
} from "../domain/ports/decision.repository.port";

export interface RecordDecisionInput {
  workspaceId: string;
  taskId?: string;
  subject: string;
  rationale: string;
  alternatives?: readonly ConsideredAlternative[];
  outcome: string;
  confidence?: DecisionConfidence;
  authorType: ActorType;
  authorId: string;
}

export interface RecordDecisionOutput {
  decisionId: string;
}

export type RecordDecisionError =
  | GuardViolation
  | WorkspaceNotFoundError
  | WorkspaceNotActiveError
  | TaskNotFoundError;

@Injectable()
export class RecordDecisionUseCase
  implements UseCase<RecordDecisionInput, Result<RecordDecisionOutput, RecordDecisionError>>
{
  constructor(
    @Inject(DECISION_REPOSITORY) private readonly decisions: DecisionRepository,
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: RecordDecisionInput,
  ): Promise<Result<RecordDecisionOutput, RecordDecisionError>> {
    const workspace = await this.workspaces.findById(input.workspaceId);
    if (!workspace || workspace.status === "DELETED") {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }
    if (workspace.status !== "ACTIVE") {
      return Result.fail(new WorkspaceNotActiveError(workspace.status));
    }

    // The task link is a real foreign key: a ghost reference would surface as
    // a raw constraint violation instead of a clean refusal.
    if (input.taskId !== undefined) {
      const task = await this.tasks.findById(input.taskId);
      if (!task || task.workspaceId !== input.workspaceId) {
        return Result.fail(new TaskNotFoundError(input.taskId));
      }
    }

    const author = ActorRef.create(input.authorType, input.authorId);
    if (author.isFailure) {
      return Result.fail(author.error);
    }

    const decision = Decision.record({
      workspaceId: input.workspaceId,
      ...(input.taskId !== undefined && { taskId: input.taskId }),
      subject: input.subject,
      rationale: input.rationale,
      ...(input.alternatives !== undefined && { alternatives: input.alternatives }),
      outcome: input.outcome,
      ...(input.confidence !== undefined && { confidence: input.confidence }),
      author: author.value,
      now: this.clock.now(),
    });
    if (decision.isFailure) {
      return Result.fail(decision.error);
    }

    await this.decisions.save(decision.value);
    flushDomainEvents(decision.value, this.publisher);
    return Result.ok({ decisionId: decision.value.id.value });
  }
}
