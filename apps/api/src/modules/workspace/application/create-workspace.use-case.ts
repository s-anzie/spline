import { ActorType, WorkspaceRole } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { AssignWorkspaceRoleUseCase } from "../../identity/application/assign-workspace-role.use-case";
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../domain/ports/workspace.repository.port";
import { Workspace } from "../domain/workspace";
import { EmptyWorkspaceNameError } from "../domain/workspace.errors";
import { withDefaultWorkspaceRuleset } from "./default-workspace-ruleset";

export interface CreateWorkspaceInput {
  name: string;
  description?: string;
  ruleset?: Record<string, unknown>;
  ownerId: string;
}

@Injectable()
export class CreateWorkspaceUseCase {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspaces: WorkspaceRepository,
    private readonly assignWorkspaceRole: AssignWorkspaceRoleUseCase,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(
    input: CreateWorkspaceInput,
  ): Promise<Result<Workspace, EmptyWorkspaceNameError>> {
    let workspace: Workspace;
    try {
      workspace = Workspace.create({
        name: input.name,
        description: input.description,
        ruleset: withDefaultWorkspaceRuleset(input.ruleset),
      });
    } catch (error) {
      if (error instanceof EmptyWorkspaceNameError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.workspaces.save(workspace);
    await this.assignWorkspaceRole.execute({
      workspaceId: workspace.id.toString(),
      actorType: ActorType.HUMAN,
      actorId: input.ownerId,
      role: WorkspaceRole.OWNER,
    });

    this.eventPublisher.publishAll(workspace.domainEvents);
    workspace.clearEvents();

    return Result.ok(workspace);
  }
}
