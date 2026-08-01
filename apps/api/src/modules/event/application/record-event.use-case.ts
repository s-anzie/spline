import { EventSeverity } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { Event, EventActorRef, EventTargetRef } from "../domain/event";
import { EmptyEventTypeError } from "../domain/event.errors";
import { EVENT_REPOSITORY, EventRepository } from "../domain/ports/event.repository.port";

export interface RecordEventInput {
  workspaceId: string;
  type: string;
  severity?: EventSeverity;
  actor: EventActorRef;
  target?: EventTargetRef;
  payload?: Record<string, unknown>;
}

export type RecordEventError = WorkspaceNotFoundError | EmptyEventTypeError;

@Injectable()
export class RecordEventUseCase {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    private readonly getWorkspace: GetWorkspaceUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: RecordEventInput): Promise<Result<Event, RecordEventError>> {
    const workspaceResult = await this.getWorkspace.execute(input.workspaceId);
    if (workspaceResult.isFailure) {
      return Result.fail(workspaceResult.error);
    }

    let event: Event;
    try {
      event = Event.record(input, this.clock.now());
    } catch (error) {
      if (error instanceof EmptyEventTypeError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.events.save(event);
    this.eventPublisher.publishAll(event.domainEvents);
    event.clearEvents();

    return Result.ok(event);
  }
}
