import { Module } from "@nestjs/common";

import { WorkspaceModule } from "../workspace/workspace.module";
import { GetEventUseCase } from "./application/get-event.use-case";
import { ListEventReceiptsByEventUseCase } from "./application/list-event-receipts-by-event.use-case";
import { ListEventsByWorkspaceUseCase } from "./application/list-events-by-workspace.use-case";
import { RecordEventReceiptUseCase } from "./application/record-event-receipt.use-case";
import { RecordEventUseCase } from "./application/record-event.use-case";
import { EVENT_RECEIPT_REPOSITORY } from "./domain/ports/event-receipt.repository.port";
import { EVENT_REPOSITORY } from "./domain/ports/event.repository.port";
import { PrismaEventReceiptRepository } from "./infrastructure/prisma-event-receipt.repository";
import { PrismaEventRepository } from "./infrastructure/prisma-event.repository";
import { EventController } from "./interface/event.controller";

@Module({
  imports: [WorkspaceModule],
  controllers: [EventController],
  providers: [
    RecordEventUseCase,
    GetEventUseCase,
    ListEventsByWorkspaceUseCase,
    RecordEventReceiptUseCase,
    ListEventReceiptsByEventUseCase,
    { provide: EVENT_REPOSITORY, useClass: PrismaEventRepository },
    { provide: EVENT_RECEIPT_REPOSITORY, useClass: PrismaEventReceiptRepository },
  ],
})
export class EventModule {}
