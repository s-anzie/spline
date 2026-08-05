import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import { TransactionClient, withTransaction } from "./transaction-context";

/**
 * How long one request's writes may hold a transaction open. Generous
 * compared to a single statement, because a request here can raise a fact
 * that a listener reacts to, and that whole chain writes inside the same
 * transaction — which is the point.
 */
const TRANSACTION_TIMEOUT_MS = 20_000;
const TRANSACTION_WAIT_MS = 10_000;

/**
 * §14.1 — the boundary that makes an aggregate and the facts it raised land
 * together, or not at all.
 *
 * The defect it closes was written down before it was fixed
 * (`modules/event/doc.md` §1.7): the event was written AFTER the aggregate,
 * in its own transaction, so a process dying between the two lost the fact
 * while keeping the change. Everything downstream — a notification nobody
 * gets, a goal whose progress never recomputes — follows from that one gap.
 *
 * Announcements are released after the commit, never inside it. A listener
 * that ran inside would be reacting to a world nobody else can see yet; one
 * that throws afterwards leaves the fact on record, and §14.5 makes a
 * recorded fact replayable.
 */
@Injectable()
export class UnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    const { value, announce } = await this.prisma.$transaction(
      async (transaction) =>
        withTransaction(transaction as unknown as TransactionClient, work),
      { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_WAIT_MS },
    );

    await announce();
    return value;
  }
}
