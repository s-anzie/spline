import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import {
  WORKSPACE_MEMBERSHIP_REPOSITORY,
  WorkspaceMembershipRepository,
} from "../../identity/domain/ports/identity.repository.ports";
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../domain/ports/workspace.repository.port";
import { Workspace } from "../domain/workspace";

export interface ListWorkspacesForActorInput {
  actorType: ActorType;
  actorId: string;
}

/** "My workspaces" — always scoped to one actor, never cross-tenant. */
@Injectable()
export class ListWorkspacesForActorUseCase
  implements UseCase<ListWorkspacesForActorInput, Result<Workspace[], GuardViolation>>
{
  constructor(
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    @Inject(WORKSPACE_MEMBERSHIP_REPOSITORY)
    private readonly memberships: WorkspaceMembershipRepository,
  ) {}

  async execute(
    input: ListWorkspacesForActorInput,
  ): Promise<Result<Workspace[], GuardViolation>> {
    const actor = ActorRef.create(input.actorType, input.actorId);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }
    const memberships = await this.memberships.listByActor(actor.value);
    const workspaces = await this.workspaces.listByIds(
      memberships.map((membership) => membership.workspaceId),
    );
    return Result.ok(workspaces.filter((workspace) => workspace.status !== "DELETED"));
  }
}
