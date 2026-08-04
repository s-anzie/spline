import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { ActorIdentity } from "../../identity/application/permissions.service";
import { ActorType } from "../../identity/domain/actor";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import { AdvanceEventReceiptUseCase } from "../application/advance-event-receipt.use-case";
import { ListEventsUseCase } from "../application/list-events.use-case";
import { ListPendingReceiptsUseCase } from "../application/list-pending-receipts.use-case";
import { RecordEventUseCase } from "../application/record-event.use-case";
import { RequireEventReceiptsUseCase } from "../application/require-event-receipts.use-case";
import { Event } from "../domain/event";
import { EventReceipt } from "../domain/event-receipt";
import {
  AdvanceReceiptDto,
  ListEventsQueryDto,
  RecordEventDto,
  RequireReceiptsDto,
} from "./dto/event.dtos";

interface EventView {
  id: string;
  workspaceId: string | null;
  type: string;
  severity: string;
  actor: { type: string; id: string } | null;
  target: { type: string; id: string };
  payload: Record<string, unknown>;
  /** A string: a BigInt does not survive JSON. */
  sequence: string;
  createdAt: string;
}

function toView(event: Event): EventView {
  return {
    id: event.id.value,
    workspaceId: event.workspaceId,
    type: event.type,
    severity: event.severity,
    actor: event.actor
      ? { type: event.actor.type, id: event.actor.actorId }
      : null,
    target: { type: event.targetType, id: event.targetId },
    payload: event.payload,
    sequence: event.sequence.toString(),
    createdAt: event.createdAt.toISOString(),
  };
}

function toReceiptView(receipt: EventReceipt, event: Event | null) {
  return {
    id: receipt.id.value,
    eventId: receipt.eventId,
    status: receipt.status,
    seenAt: receipt.seenAt?.toISOString() ?? null,
    acknowledgedAt: receipt.acknowledgedAt?.toISOString() ?? null,
    actedAt: receipt.actedAt?.toISOString() ?? null,
    allowedStatusTargets: receipt.allowedStatusTargets(),
    event: event ? toView(event) : null,
  };
}

@Controller()
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class EventController {
  constructor(
    private readonly recordEvent: RecordEventUseCase,
    private readonly listEvents: ListEventsUseCase,
    private readonly requireReceipts: RequireEventReceiptsUseCase,
    private readonly advanceReceipt: AdvanceEventReceiptUseCase,
    private readonly listPending: ListPendingReceiptsUseCase,
  ) {}

  /** Publishing a fact is an act of work — a worker or an agent reporting. */
  @Post("workspaces/:workspaceId/events")
  @RequirePermission("execute_tasks")
  async record(
    @Param("workspaceId") workspaceId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: RecordEventDto,
  ): Promise<{ eventId: string; sequence: string }> {
    const result = await this.recordEvent.execute({
      workspaceId,
      ...dto,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
  }

  /** The journal, and therefore the replay: reading, never re-emitting. */
  @Get("workspaces/:workspaceId/events")
  @RequirePermission("read_workspace_state")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListEventsQueryDto,
  ): Promise<EventView[]> {
    const result = await this.listEvents.execute({
      workspaceId,
      ...(query.type !== undefined && { type: query.type }),
      ...(query.severity !== undefined && { severities: [query.severity] }),
      ...(query.targetType !== undefined && { targetType: query.targetType }),
      ...(query.targetId !== undefined && { targetId: query.targetId }),
      ...(query.afterSequence !== undefined && {
        afterSequence: BigInt(query.afterSequence),
      }),
      ...(query.limit !== undefined && { limit: query.limit }),
    });
    return result.value.map(toView);
  }

  @Post("workspaces/:workspaceId/events/:eventId/receipts")
  @RequirePermission("manage_tasks")
  async require(
    @Param("workspaceId") workspaceId: string,
    @Param("eventId") eventId: string,
    @Body() dto: RequireReceiptsDto,
  ): Promise<{ receiptIds: string[] }> {
    const result = await this.requireReceipts.execute({
      workspaceId,
      eventId,
      actors: dto.actorIds.map((actorId) => ({
        actorType: dto.actorType as ActorType,
        actorId,
      })),
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
  }

  /** An actor declares for themselves; nobody declares on their behalf. */
  @Post("workspaces/:workspaceId/events/:eventId/receipts/mine")
  @HttpCode(200)
  @RequirePermission("read_workspace_state")
  async advance(
    @Param("workspaceId") workspaceId: string,
    @Param("eventId") eventId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: AdvanceReceiptDto,
  ): Promise<{ ok: true }> {
    const result = await this.advanceReceipt.execute({
      workspaceId,
      eventId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      status: dto.status,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return { ok: true };
  }

  /**
   * What the caller still has to take notice of, in one workspace. Scoping to
   * the caller alone was NOT enough: an actor in two workspaces got a single
   * mixed list, and the route carried no permission guard, so it kept
   * answering after a membership was revoked (§4.2, §20.4).
   */
  @Get("workspaces/:workspaceId/event-receipts/mine")
  @RequirePermission("read_workspace_state")
  async mine(
    @Param("workspaceId") workspaceId: string,
    @CurrentActor() actor: ActorIdentity,
  ) {
    const result = await this.listPending.execute({
      workspaceId,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value.map((pending) => toReceiptView(pending.receipt, pending.event));
  }
}
