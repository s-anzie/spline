import { AsyncLocalStorage } from "node:async_hooks";

import { Injectable } from "@nestjs/common";

import { DomainError } from "../domain/domain-error";

/**
 * Refused before the stack does it for us, and with the chain named: an
 * anonymous "Maximum call stack size exceeded" tells nobody which two
 * listeners are feeding each other.
 */
export class ReactionLoopError extends DomainError {
  constructor(
    readonly chain: readonly string[],
    readonly max: number,
  ) {
    super(
      `Reaction chain exceeded ${max} levels and was stopped: ${chain.join(" → ")}. ` +
        `A listener is publishing a fact that leads back to itself.`,
    );
  }
}

/**
 * How deep a chain of reactions may go before it is treated as a loop.
 *
 * Five, the same bound OpenClaw puts on agent↔agent exchanges
 * (`session.agentToAgent.maxPingPongTurns`, default 5). Legitimate chains in
 * this system are short — a goal is cancelled, its tasks are cancelled, their
 * assignees are told: three. A chain past five is not deep work, it is a
 * cycle.
 */
export const MAX_REACTION_DEPTH = 5;

/**
 * Bounds how far one published fact may cascade.
 *
 * This became necessary the moment publication started being awaited: with a
 * fire-and-forget bus, a listener that published what it listened to leaked
 * floating promises; now it recurses inside the caller's own stack and the
 * originating request never returns. Nothing in the codebase does this today
 * — the point is that nothing *can* start doing it silently, and that the
 * failure names the chain instead of overflowing the stack.
 *
 * The chain is held in an AsyncLocalStorage, not in a field. A field looked
 * sufficient — one publish, one synchronous cascade — and it was wrong: the
 * provider is a singleton, so two concurrent requests shared one counter,
 * each seeing the other's depth. A legitimate chain could then be refused
 * because an unrelated request happened to be three levels deep. Per-async-
 * context state is the whole requirement here, not machinery around it.
 */
@Injectable()
export class ReactionDepth {
  private readonly storage = new AsyncLocalStorage<string[]>();

  constructor(private readonly max: number = MAX_REACTION_DEPTH) {}

  get current(): number {
    return this.storage.getStore()?.length ?? 0;
  }

  async within<T>(eventName: string, run: () => Promise<T>): Promise<T> {
    const chain = this.storage.getStore();
    if (!chain) {
      return this.storage.run([eventName], run);
    }
    if (chain.length >= this.max) {
      throw new ReactionLoopError([...chain, eventName], this.max);
    }
    chain.push(eventName);
    try {
      return await run();
    } finally {
      chain.pop();
    }
  }
}
