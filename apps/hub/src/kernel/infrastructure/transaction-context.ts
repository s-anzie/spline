import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The subset of a Prisma client a repository ever touches. Kept structural
 * rather than importing Prisma's own type: the kernel must not depend on the
 * persistence library, and what matters here is only "something with model
 * delegates on it".
 */
export type TransactionClient = Record<string, unknown>;

interface TransactionScope {
  client: TransactionClient;
  /**
   * Emissions waiting for the commit.
   *
   * A reaction must never run on a fact that is not yet visible: inside a
   * transaction, a listener that queried the database would be reading a
   * world where the change has not happened. So facts are WRITTEN inside the
   * transaction and ANNOUNCED after it, which is the whole point of the
   * outbox shape.
   */
  pending: (() => Promise<void>)[];
}

const storage = new AsyncLocalStorage<TransactionScope>();

/** The ambient transaction, if this call is running inside one. */
export function currentTransaction(): TransactionClient | undefined {
  return storage.getStore()?.client;
}

/**
 * Registers work to run once the surrounding transaction commits. Outside a
 * transaction there is nothing to wait for, so it runs immediately — which is
 * what makes the same publisher correct in both cases.
 */
export async function afterCommit(work: () => Promise<void>): Promise<void> {
  const scope = storage.getStore();
  if (!scope) {
    await work();
    return;
  }
  scope.pending.push(work);
}

/**
 * Runs `work` with `client` as the ambient transaction, then releases the
 * announcements it collected.
 *
 * The announcements run OUTSIDE the transaction on purpose. If a listener
 * throws, the write stays committed and the fact stays journalled: §14.5
 * makes a recorded fact replayable, and rolling a whole request back because
 * a reaction failed would lose the very record that makes replay possible.
 */
export async function withTransaction<T>(
  client: TransactionClient,
  work: () => Promise<T>,
): Promise<{ value: T; announce: () => Promise<void> }> {
  const scope: TransactionScope = { client, pending: [] };
  const value = await storage.run(scope, work);
  return {
    value,
    announce: async () => {
      for (const emit of scope.pending) {
        await emit();
      }
    },
  };
}
