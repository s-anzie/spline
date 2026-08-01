import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";

import {
  AuthenticatedRequester,
  CurrentRequester,
  JwtAuthGuard,
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface";
import { DomainError } from "../../../kernel/domain/domain-error";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { EventNotFoundError } from "../application/event-application.errors";
import { GetEventUseCase } from "../application/get-event.use-case";
import { ListEventReceiptsByEventUseCase } from "../application/list-event-receipts-by-event.use-case";
import { ListEventsByWorkspaceUseCase } from "../application/list-events-by-workspace.use-case";
import { RecordEventReceiptUseCase } from "../application/record-event-receipt.use-case";
import { RecordEventUseCase } from "../application/record-event.use-case";
import { Event } from "../domain/event";
import { EmptyEventTypeError } from "../domain/event.errors";
import { EventReceipt } from "../domain/event-receipt";
import { InvalidEventReceiptStatusError } from "../domain/event-receipt.errors";
import { RecordEventDto } from "./dto/record-event.dto";
import { RecordEventReceiptDto } from "./dto/record-event-receipt.dto";

function toEventResponse(event: Event) {
  return {
    id: event.id.toString(),
    workspaceId: event.workspaceId,
    type: event.type,
    severity: event.severity,
    actor: event.actor,
    target: event.target ?? null,
    payload: event.payload,
    createdAt: event.createdAt.toISOString(),
  };
}

function toReceiptResponse(receipt: EventReceipt) {
  return {
    id: receipt.id.toString(),
    eventId: receipt.eventId,
    actorType: receipt.actorType,
    actorId: receipt.actorId,
    status: receipt.status,
    seenAt: receipt.seenAt?.toISOString() ?? null,
    acknowledgedAt: receipt.acknowledgedAt?.toISOString() ?? null,
    actedAt: receipt.actedAt?.toISOString() ?? null,
  };
}

function toHttpError(error: DomainError): Error {
  if (error instanceof WorkspaceNotFoundError || error instanceof EventNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof EmptyEventTypeError || error instanceof InvalidEventReceiptStatusError) {
    return new BadRequestException(error.message);
  }
  return new BadRequestException(error.message);
}

@Controller("workspaces/:workspaceId/events")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EventController {
  constructor(
    private readonly recordEventUseCase: RecordEventUseCase,
    private readonly getEventUseCase: GetEventUseCase,
    private readonly listEventsByWorkspaceUseCase: ListEventsByWorkspaceUseCase,
    private readonly recordEventReceiptUseCase: RecordEventReceiptUseCase,
    private readonly listEventReceiptsByEventUseCase: ListEventReceiptsByEventUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async record(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: RecordEventDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.recordEventUseCase.execute({
      workspaceId,
      type: dto.type,
      severity: dto.severity,
      actor: { type: requester.type, id: requester.id },
      target: dto.target,
      payload: dto.payload,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toEventResponse(result.value);
  }

  @Get()
  @RequirePermission("read_tasks")
  async list(@Param("workspaceId") workspaceId: string) {
    const events = await this.listEventsByWorkspaceUseCase.execute(workspaceId);
    return events.map(toEventResponse);
  }

  @Get(":eventId")
  @RequirePermission("read_tasks")
  async get(@Param("eventId") eventId: string) {
    const result = await this.getEventUseCase.execute(eventId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toEventResponse(result.value);
  }

  @Post(":eventId/receipts")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("read_tasks")
  async recordReceipt(
    @Param("eventId") eventId: string,
    @Body() dto: RecordEventReceiptDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.recordEventReceiptUseCase.execute({
      eventId,
      actor: { type: requester.type, id: requester.id },
      status: dto.status,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toReceiptResponse(result.value);
  }

  @Get(":eventId/receipts")
  @RequirePermission("read_tasks")
  async listReceipts(@Param("eventId") eventId: string) {
    const receipts = await this.listEventReceiptsByEventUseCase.execute(eventId);
    return receipts.map(toReceiptResponse);
  }
}
