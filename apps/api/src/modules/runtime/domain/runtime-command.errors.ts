import { RuntimeCommandStatus } from "@repo/db";

import { DomainError } from "../../../kernel/domain/domain-error";

export class InvalidRuntimeCommandStatusTransitionError extends DomainError {
  constructor(from: RuntimeCommandStatus, to: RuntimeCommandStatus) {
    super(
      "INVALID_RUNTIME_COMMAND_STATUS_TRANSITION",
      `Cannot move a runtime command from "${from}" to "${to}"`,
    );
  }
}
