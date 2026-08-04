import { Global, Module } from "@nestjs/common";

import { EVENT_PUBLISHER } from "../../kernel/domain/ports/event-publisher.port";
import { IdentityModule } from "../identity/identity.module";
import { AdvanceEventReceiptUseCase } from "./application/advance-event-receipt.use-case";
import {
  GetEventUseCase,
  ListEventsUseCase,
} from "./application/list-events.use-case";
import { ListPendingReceiptsUseCase } from "./application/list-pending-receipts.use-case";
import { RecordEventUseCase } from "./application/record-event.use-case";
import { RequireEventReceiptsUseCase } from "./application/require-event-receipts.use-case";
import {
  EVENT_RECEIPT_REPOSITORY,
  EVENT_REPOSITORY,
} from "./domain/ports/event.repository.port";
import {
  PrismaEventReceiptRepository,
  PrismaEventRepository,
} from "./infrastructure/prisma-event.repository";
import { ReactionDepth } from "../../kernel/application/reaction-depth";
import { PersistentEventPublisher } from "./infrastructure/persistent-event-publisher";
import { EventController } from "./interface/event.controller";

/**
 * Global because it REPLACES the kernel's default EVENT_PUBLISHER for the
 * whole application: Nest resolves a provider's tokens inside its own module,
 * so a local binding would leave every other module publishing into memory.
 * Same reason as WorkloadModule.
 */
@Global()
@Module({
  imports: [IdentityModule],
  controllers: [EventController],
  providers: [
    // A factory, not a class binding: the ceiling is a constructor argument
    // with a default, and Nest would try to inject a Number for it.
    { provide: ReactionDepth, useFactory: () => new ReactionDepth() },
    { provide: EVENT_REPOSITORY, useClass: PrismaEventRepository },
    { provide: EVENT_RECEIPT_REPOSITORY, useClass: PrismaEventReceiptRepository },
    { provide: EVENT_PUBLISHER, useClass: PersistentEventPublisher },
    RecordEventUseCase,
    ListEventsUseCase,
    GetEventUseCase,
    RequireEventReceiptsUseCase,
    AdvanceEventReceiptUseCase,
    ListPendingReceiptsUseCase,
  ],
  exports: [EVENT_REPOSITORY, EVENT_RECEIPT_REPOSITORY, EVENT_PUBLISHER, RecordEventUseCase],
})
export class EventModule {}
