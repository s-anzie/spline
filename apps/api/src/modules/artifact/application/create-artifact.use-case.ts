import { ArtifactType } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { GetGoalUseCase } from "../../goal/application/get-goal.use-case";
import { GetTaskUseCase } from "../../task/application/get-task.use-case";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { Actor, Artifact } from "../domain/artifact";
import { ARTIFACT_REPOSITORY, ArtifactRepository } from "../domain/ports/artifact.repository.port";
import { LinkedGoalNotInWorkspaceError, LinkedTaskNotInWorkspaceError } from "./artifact-application.errors";

export interface CreateArtifactInput {
  workspaceId: string;
  goalId?: string;
  taskId?: string;
  decisionId?: string;
  processId?: string;
  type: ArtifactType;
  name: string;
  description?: string;
  source?: string;
  contentRef?: string;
  checksum?: string;
  createdBy: Actor;
}

export type CreateArtifactError =
  | WorkspaceNotFoundError
  | LinkedGoalNotInWorkspaceError
  | LinkedTaskNotInWorkspaceError;

@Injectable()
export class CreateArtifactUseCase {
  constructor(
    @Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepository,
    private readonly getWorkspace: GetWorkspaceUseCase,
    private readonly getGoal: GetGoalUseCase,
    private readonly getTask: GetTaskUseCase,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: CreateArtifactInput): Promise<Result<Artifact, CreateArtifactError>> {
    const workspaceResult = await this.getWorkspace.execute(input.workspaceId);
    if (workspaceResult.isFailure) {
      return Result.fail(workspaceResult.error);
    }

    if (input.goalId !== undefined) {
      const goalResult = await this.getGoal.execute(input.goalId);
      if (goalResult.isFailure) {
        return Result.fail(new LinkedGoalNotInWorkspaceError(input.goalId, input.workspaceId));
      }
      if (goalResult.value.workspaceId !== input.workspaceId) {
        return Result.fail(new LinkedGoalNotInWorkspaceError(input.goalId, input.workspaceId));
      }
    }

    if (input.taskId !== undefined) {
      const taskResult = await this.getTask.execute(input.taskId);
      if (taskResult.isFailure) {
        return Result.fail(new LinkedTaskNotInWorkspaceError(input.taskId, input.workspaceId));
      }
      if (taskResult.value.workspaceId !== input.workspaceId) {
        return Result.fail(new LinkedTaskNotInWorkspaceError(input.taskId, input.workspaceId));
      }
    }

    const artifact = Artifact.create({
      workspaceId: input.workspaceId,
      goalId: input.goalId,
      taskId: input.taskId,
      decisionId: input.decisionId,
      processId: input.processId,
      type: input.type,
      name: input.name,
      description: input.description,
      source: input.source,
      contentRef: input.contentRef,
      checksum: input.checksum,
      createdBy: input.createdBy,
    });

    await this.artifacts.save(artifact);
    this.eventPublisher.publishAll(artifact.domainEvents);
    artifact.clearEvents();

    return Result.ok(artifact);
  }
}
