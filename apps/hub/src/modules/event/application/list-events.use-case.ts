import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { Event } from "../domain/event";
import { EventNotFoundError } from "../domain/event.errors";
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
      /**
       * §14 — newest first, unless the caller is replaying.
       *
       * A page read without a cursor is somebody LOOKING at a screen, and
       * they want what just happened. Answering with the oldest page made the
       * Activity screen useless the moment a workspace had any history: the
       * newest fact anybody could see was from the workspace's first minutes,
       * so an operator watching for their agent to start saw a screen that
       * never changed and concluded, reasonably, that nothing was running.
       *
       * With `afterSequence` the caller is walking the journal forward from a
       * point and wants what came NEXT, which is ascending. The cursor is
       * exactly what tells the two apart.
       */
      newestFirst: input.afterSequence === undefined,
    });
    return Result.ok(events);
  }
}

/**
 * An identifier the API hands out must be resolvable through the API: this
 * one comes back from recording a fact and from every receipt view.
 */
@Injectable()
export class GetEventUseCase
  implements
    UseCase<{ workspaceId: string; eventId: string }, Result<Event, EventNotFoundError>>
{
  constructor(@Inject(EVENT_REPOSITORY) private readonly events: EventRepository) {}

  async execute(input: {
    workspaceId: string;
    eventId: string;
  }): Promise<Result<Event, EventNotFoundError>> {
    const event = await this.events.findById(input.eventId);
    // A fact from another workspace is reported absent, not forbidden: saying
    // "it exists but is not yours" already leaks that it exists (§4.2).
    if (!event || event.workspaceId !== input.workspaceId) {
      return Result.fail(new EventNotFoundError(input.eventId));
    }
    return Result.ok(event);
  }
}
