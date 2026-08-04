import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import {
  NOTIFICATION_RECIPIENT_REPOSITORY,
  NotificationRecipientRepository,
  UnreadForActor,
} from "../domain/ports/notification.repository.port";

export interface ListUnreadInput {
  /** Mandatory (§20.4): "no exception, not even for this query". */
  workspaceId: string;
  actorType: ActorType;
  actorId: string;
}

/**
 * "What have I not read yet, in this workspace?" — the entry point of an
 * agent's own cycle (§10.4) and the query §26 requires to be tested: sent to
 * several agents, one reads it, it disappears for them alone.
 */
@Injectable()
export class ListUnreadUseCase
  implements UseCase<ListUnreadInput, Result<UnreadForActor[], GuardViolation>>
{
  constructor(
    @Inject(NOTIFICATION_RECIPIENT_REPOSITORY)
    private readonly recipients: NotificationRecipientRepository,
  ) {}

  async execute(
    input: ListUnreadInput,
  ): Promise<Result<UnreadForActor[], GuardViolation>> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    const actor = ActorRef.create(input.actorType, input.actorId);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }
    return Result.ok(await this.recipients.listUnread(workspaceId.value, actor.value));
  }
}
