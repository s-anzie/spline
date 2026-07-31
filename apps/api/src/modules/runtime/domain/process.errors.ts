import { ProcessStatus } from "@repo/db";

import { DomainError } from "../../../kernel/domain/domain-error";

export class EmptyProcessNameError extends DomainError {
  constructor() {
    super("EMPTY_PROCESS_NAME", "Process name cannot be empty");
  }
}

export class EmptyProcessCommandError extends DomainError {
  constructor() {
    super("EMPTY_PROCESS_COMMAND", "Process command cannot be empty");
  }
}

export class InvalidProcessStatusTransitionError extends DomainError {
  constructor(from: ProcessStatus, to: ProcessStatus) {
    super("INVALID_PROCESS_STATUS_TRANSITION", `Cannot move a process from "${from}" to "${to}"`);
  }
}

export class ProcessMustBeStoppedError extends DomainError {
  constructor(processId: string) {
    super("PROCESS_MUST_BE_STOPPED", `Process "${processId}" must be stopped before editing its details`);
  }
}
