import { Global, Module } from "@nestjs/common";

import { CLOCK } from "./domain/ports/clock.port";
import { EVENT_PUBLISHER } from "./domain/ports/event-publisher.port";
import { EventEmitterEventPublisher } from "./infrastructure/event-emitter-event-publisher";
import { SystemClock } from "./infrastructure/system-clock";

/**
 * Shared domain primitives and their default infrastructure bindings.
 * Global so every module resolves CLOCK / EVENT_PUBLISHER without
 * re-importing; tests swap them for FakeClock / FakeEventPublisher.
 */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: EVENT_PUBLISHER, useClass: EventEmitterEventPublisher },
  ],
  exports: [CLOCK, EVENT_PUBLISHER],
})
export class KernelModule {}
