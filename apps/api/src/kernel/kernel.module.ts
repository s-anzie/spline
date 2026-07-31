import { Global, Module } from "@nestjs/common";

import { CLOCK } from "./domain/ports/clock.port";
import { EVENT_PUBLISHER } from "./domain/ports/event-publisher.port";
import { EventEmitterEventPublisher } from "./infrastructure/event-emitter-event-publisher";
import { SystemClock } from "./infrastructure/system-clock";

@Global()
@Module({
  providers: [
    { provide: EVENT_PUBLISHER, useClass: EventEmitterEventPublisher },
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [EVENT_PUBLISHER, CLOCK],
})
export class KernelModule {}
