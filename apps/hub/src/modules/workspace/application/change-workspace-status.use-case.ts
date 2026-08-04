import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { AUDIT_TRAIL, AuditTrail } from "../../../kernel/domain/ports/audit-trail.port";
import { UseCase } from "../../../kernel/application/use-case";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../domain/ports/workspace.repository.port";
import { WorkspaceStatus } from "../domain/workspace";
import { WorkspaceNotFoundError } from "../domain/workspace.errors";

export interface ChangeWorkspaceStatusInput {
  workspaceId: string;
  status: WorkspaceStatus;
  actorType: ActorType;
  actorId: string;
}

export type ChangeWorkspaceStatusError =
  | WorkspaceNotFoundError
  | InvalidStateTransitionError;

@Injectable()
export class ChangeWorkspaceStatusUseCase
  implements
    UseCase<ChangeWorkspaceStatusInput, Result<void, ChangeWorkspaceStatusError>>
{
  constructor(
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
  ) {}

  async execute(
    input: ChangeWorkspaceStatusInput,
  ): Promise<Result<void, ChangeWorkspaceStatusError>> {
    const workspace = await this.workspaces.findById(input.workspaceId);
    if (!workspace) {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }

    const previousStatus = workspace.status;
    const changed = workspace.changeStatus(input.status, this.clock.now());
    if (changed.isFailure) {
      return Result.fail(changed.error);
    }

    await this.workspaces.save(workspace);
    await flushDomainEvents(workspace, this.publisher);

    // §18.7 audits "Delete". Deletion here is a status, not a row removal, so
    // it is the transition into DELETED that is the auditable act — the other
    // transitions are ordinary workspace life and would only add noise.
    if (input.status === "DELETED") {
      const actor = ActorRef.create(input.actorType, input.actorId);
      if (actor.isSuccess) {
        await this.audit.record({
          workspaceId: workspace.id.value,
          actor: actor.value,
          action: "workspace.deleted",
          targetType: "workspace",
          targetId: workspace.id.value,
          before: { status: previousStatus, name: workspace.name },
          after: { status: "DELETED" },
        });
      }
    }
    return Result.ok(undefined);
  }
}
