import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createPrismaAdapter, PrismaClient } from "@repo/db";

import {
  currentTransaction,
  TransactionClient,
} from "../kernel/infrastructure/transaction-context";

/** Model delegates: `prisma.task`, `prisma.workspace`, … */
function isModelDelegate(property: string | symbol): property is string {
  return (
    typeof property === "string" &&
    !property.startsWith("$") &&
    !property.startsWith("_")
  );
}

/**
 * Raw SQL has to join the ambient transaction too, and finding out why cost a
 * twenty-second hang.
 *
 * The audit chain takes `pg_advisory_xact_lock` before reading the previous
 * signature. Left on the base client it runs on a DIFFERENT connection, so it
 * waited on row locks the open transaction was holding — and waited until the
 * transaction timed out. A raw query that does not join the transaction is
 * not merely outside it: it can block it.
 */
const RAW_METHODS = new Set([
  "$queryRaw",
  "$queryRawTyped",
  "$queryRawUnsafe",
  "$executeRaw",
  "$executeRawUnsafe",
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    super({
      adapter: createPrismaAdapter(configService.getOrThrow<string>("DATABASE_URL")),
    });

    /**
     * §14.1 — what makes the event insert share the repository's transaction
     * without a single repository knowing there is one.
     *
     * A repository writes `this.prisma.task.update(...)`. When a transaction
     * is ambient that delegate comes from the transaction; otherwise from
     * this client. The alternative was threading a client argument through
     * every repository method and every use case — around sixty files whose
     * only change would be carrying something they do not care about, and
     * sixty chances to forget one. A forgotten one would write outside the
     * transaction silently, which is the exact defect being closed.
     *
     * Returning a Proxy from a constructor is legal, and it is what every
     * injection site receives.
     */
    return new Proxy(this, {
      get(target, property, receiver) {
        const transaction = currentTransaction();
        if (transaction) {
          if (isModelDelegate(property) && property in transaction) {
            return transaction[property];
          }
          if (RAW_METHODS.has(property as string)) {
            return (transaction[property as string] as unknown as CallableFunction).bind(
              transaction,
            );
          }
          /**
           * A repository that opens its own transaction JOINS the ambient one
           * instead. Postgres has no nested transactions, and Prisma answers a
           * nested `$transaction` with a second connection — which is how the
           * audit chain came to wait on locks held by the request that called
           * it. "Join if there is one, start one otherwise" is the only
           * meaning that does not deadlock.
           */
          if (property === "$transaction") {
            return (work: unknown) =>
              typeof work === "function"
                ? (work as (client: TransactionClient) => unknown)(transaction)
                : Reflect.get(target, property, receiver);
          }
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
