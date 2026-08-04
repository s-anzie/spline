import { Global, Module } from "@nestjs/common";

import { CLOCK } from "./domain/ports/clock.port";
import { SystemClock } from "./infrastructure/system-clock";

/**
 * Shared domain primitives and their default infrastructure bindings.
 * Global so every module resolves CLOCK without re-importing; tests swap it
 * for FakeClock.
 *
 * EVENT_PUBLISHER is deliberately NOT bound here: the Event module owns the
 * durable implementation, and two global modules exporting the same token
 * leave which one wins to registration order — a coin toss deciding whether
 * facts are persisted. One owner, no ambiguity.
 */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [CLOCK],
})
export class KernelModule {}
