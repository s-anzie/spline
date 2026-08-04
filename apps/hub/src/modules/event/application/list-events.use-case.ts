import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { Event } from "../domain/event";
import { EventSeverity } from "../domain/event-severity";
import { EVENT_REPOSITORY, EventRepository } from "../domain/ports/event.repository.port";

export interface ListEventsInput {
  workspaceId: string;
  type?: string;
  severities?: readonly EventSeverity[];
  targetType?: string;
  targetId?: string;
  actorType?: ActorType;
  actorId?: string;
  afterSequence?: bigint;
  limit?: number;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * The journal, and therefore the replay (§14.5). Reading, never re-emitting:
 * §14.3 says a fact is published once, and re-emitting would fire reactions
 * that already ran.
 */
@Injectable()
export class ListEventsUseCase
  implements UseCase<ListEventsInput, Result<Event[], never>>
{
  constructor(@Inject(EVENT_REPOSITORY) private readonly events: EventRepository) {}

  async execute(input: ListEventsInput): Promise<Result<Event[], never>> {
    const actor =
      input.actorType && input.actorId
        ? ActorRef.create(input.actorType, input.actorId)
        : null;

    const events = await this.events.list({
      workspaceId: input.workspaceId,
      ...(input.type !== undefined && { type: input.type }),
      ...(input.severities !== undefined && { severities: input.severities }),
      ...(input.targetType !== undefined && { targetType: input.targetType }),
      ...(input.targetId !== undefined && { targetId: input.targetId }),
      ...(input.afterSequence !== undefined && { afterSequence: input.afterSequence }),
      ...(actor?.isSuccess && { actor: actor.value }),
      limit: Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
    });
    return Result.ok(events);
  }
}
