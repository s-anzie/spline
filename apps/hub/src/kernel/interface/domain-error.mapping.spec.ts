import {
  ConflictException,
  GoneException,
  NotFoundException,
} from "@nestjs/common";

import { InvalidStateTransitionError } from "../domain/errors";
import { toHttpException } from "./domain-error.mapping";

class TaskNotFoundError extends Error {
  override name = "TaskNotFoundError";
}
class SomethingElseError extends Error {
  override name = "SomethingElseError";
}

/**
 * One place decides how a domain failure becomes an HTTP status. Five
 * controllers had re-derived these rules by hand and had already drifted.
 */
describe("toHttpException", () => {
  it("maps any *NotFoundError to 404 by convention, without a registry", () => {
    expect(toHttpException(new TaskNotFoundError("x"))).toBeInstanceOf(NotFoundException);
  });

  it("maps a non-terminal invalid transition to 409", () => {
    const error = new InvalidStateTransitionError("Task", {
      kind: "invalidTransition",
      from: "PLANNED",
      to: "COMPLETED",
      fromTerminal: false,
    });

    expect(toHttpException(error)).toBeInstanceOf(ConflictException);
  });

  it("maps a transition out of a terminal state to 410 — gone for good", () => {
    const error = new InvalidStateTransitionError("Task", {
      kind: "invalidTransition",
      from: "CANCELLED",
      to: "READY",
      fromTerminal: true,
    });

    expect(toHttpException(error)).toBeInstanceOf(GoneException);
  });

  it("maps explicitly declared conflicts to 409", () => {
    expect(
      toHttpException(new SomethingElseError("x"), { conflicts: ["SomethingElseError"] }),
    ).toBeInstanceOf(ConflictException);
  });

  it("falls back to 400 for anything the caller has not classified", () => {
    const exception = toHttpException(new SomethingElseError("boom"));

    expect(exception.getStatus()).toBe(400);
    expect(exception.message).toBe("boom");
  });

  it("carries the domain message through unchanged", () => {
    expect(toHttpException(new TaskNotFoundError("not here")).message).toBe("not here");
  });
});
