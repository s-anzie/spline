import { LocalMachineRuntimeStatus } from "@repo/db";

import { DomainError } from "../../../kernel/domain/domain-error";

export class EmptyMachineHostnameError extends DomainError {
  constructor() {
    super("EMPTY_MACHINE_HOSTNAME", "Machine hostname cannot be empty");
  }
}

export class InvalidMachineRuntimeStatusTransitionError extends DomainError {
  constructor(from: LocalMachineRuntimeStatus, to: LocalMachineRuntimeStatus) {
    super(
      "INVALID_MACHINE_RUNTIME_STATUS_TRANSITION",
      `Cannot move a machine from "${from}" to "${to}"`,
    );
  }
}
