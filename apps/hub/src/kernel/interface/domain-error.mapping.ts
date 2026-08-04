import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";

import { InvalidStateTransitionError } from "../domain/errors";

export interface DomainErrorMapping {
  /** Errors that mean "the state forbids this right now" → 409. */
  conflicts?: readonly string[];
  /** Errors that mean "you may not do this at all" → 403. */
  forbidden?: readonly string[];
  /** Errors that mean "the target does not exist" beyond the *NotFound convention. */
  notFound?: readonly string[];
}

/**
 * The single place that turns a domain failure into an HTTP status. Two rules
 * are universal and need no declaration:
 *   - any error named *NotFoundError is a 404 (the kernel's EntityNotFoundError
 *     subclasses all follow it);
 *   - an InvalidStateTransitionError is 410 when it leaves a terminal state
 *     (gone for good) and 409 otherwise (a conflict the caller can resolve).
 * Everything else is 400 unless a controller classifies it, which keeps the
 * default honest: unclassified means "bad request", not "silently 500".
 */
export function toHttpException(
  error: { name: string; message: string },
  mapping: DomainErrorMapping = {},
): HttpException {
  const { name, message } = error;

  if (name.endsWith("NotFoundError") || mapping.notFound?.includes(name)) {
    return new NotFoundException(message);
  }
  if (mapping.forbidden?.includes(name)) {
    return new ForbiddenException(message);
  }
  if (name === "InvalidStateTransitionError") {
    return (error as unknown as InvalidStateTransitionError).fromTerminal
      ? new GoneException(message)
      : new ConflictException(message);
  }
  if (mapping.conflicts?.includes(name)) {
    return new ConflictException(message);
  }
  return new BadRequestException(message);
}
