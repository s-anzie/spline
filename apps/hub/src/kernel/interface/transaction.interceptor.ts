import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, firstValueFrom, from } from "rxjs";

import { UnitOfWork } from "../infrastructure/unit-of-work";

/** A request that cannot write needs no transaction. */
const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * §14.1 — one request that changes something, one transaction.
 *
 * Placed here rather than inside each use case for a reason that is about
 * defects, not tidiness: a use case that forgot to open one would write
 * outside the transaction silently, and silently is exactly how the original
 * gap survived being written down for weeks. A rule applied at the edge
 * cannot be forgotten by the sixty-first use case.
 *
 * The boundary is the request, not the use case, and that is deliberate: a
 * fact raised here is reacted to within this call (`emitAsync`), the reaction
 * writes too, and all of it belongs to one decision. Splitting them would
 * leave a reaction committed against an aggregate that rolled back.
 */
@Injectable()
export class TransactionInterceptor implements NestInterceptor {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ method?: string }>();
    if (READ_ONLY_METHODS.has(request.method ?? "GET")) {
      return next.handle();
    }

    // `next.handle()` is subscribed INSIDE the callback, so the handler runs
    // within the transaction's async context rather than after it.
    return from(this.unitOfWork.run(() => firstValueFrom(next.handle())));
  }
}
