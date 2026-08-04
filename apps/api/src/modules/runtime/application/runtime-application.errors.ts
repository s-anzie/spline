import { DomainError } from "../../../kernel/domain/domain-error";

export class MachineNotFoundError extends DomainError {
  constructor(machineId: string) {
    super("MACHINE_NOT_FOUND", `Machine "${machineId}" was not found`);
  }
}

export class ProcessNotFoundError extends DomainError {
  constructor(processId: string) {
    super("PROCESS_NOT_FOUND", `Process "${processId}" was not found`);
  }
}

export class AgentSessionNotFoundError extends DomainError {
  constructor(sessionId: string) {
    super("AGENT_SESSION_NOT_FOUND", `Agent session "${sessionId}" was not found`);
  }
}

export class AgentSessionNotResumableError extends DomainError {
  constructor(sessionId: string) {
    super(
      "AGENT_SESSION_NOT_RESUMABLE",
      `Agent session "${sessionId}" has no recoverable provider conversation`,
    );
  }
}

export class MachineNotLinkedToWorkspaceError extends DomainError {
  constructor(machineId: string, workspaceId: string) {
    super(
      "MACHINE_NOT_LINKED_TO_WORKSPACE",
      `Machine "${machineId}" is not linked to workspace "${workspaceId}"`,
    );
  }
}

export class MachineNotConnectedError extends DomainError {
  constructor(machineId: string) {
    super(
      "MACHINE_NOT_CONNECTED",
      `Machine "${machineId}" has not sent a heartbeat recently and cannot receive new commands`,
    );
  }
}

export class WorkspaceRootPathNotConfiguredError extends DomainError {
  constructor(workspaceId: string) {
    super(
      "WORKSPACE_ROOT_PATH_NOT_CONFIGURED",
      `Workspace "${workspaceId}" has no rootPath configured — set one before starting processes`,
    );
  }
}

export class ProcessCwdOutsideWorkspaceRootError extends DomainError {
  constructor(cwd: string) {
    super("PROCESS_CWD_OUTSIDE_WORKSPACE_ROOT", `"${cwd}" resolves outside the workspace root`);
  }
}

export class ProcessNotLockedByRequesterError extends DomainError {
  constructor(processId: string) {
    super(
      "PROCESS_NOT_LOCKED_BY_REQUESTER",
      `Process "${processId}" must be locked by the requester before start/stop`,
    );
  }
}

export class AgentAlreadyHasActiveSessionError extends DomainError {
  constructor(agentId: string) {
    super("AGENT_ALREADY_HAS_ACTIVE_SESSION", `Agent "${agentId}" already has an active session`);
  }
}

export class ProviderUnavailableError extends DomainError {
  constructor(provider: string) {
    super(
      "PROVIDER_UNAVAILABLE",
      `Provider "${provider}" is unavailable; change the agent provider before starting it`,
    );
  }
}
