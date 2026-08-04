import { DomainError } from "../../../kernel/domain/domain-error";
import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class WorkerNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("WorkerNode", id);
  }
}

export class SessionNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("AgentSession", id);
  }
}

export class ProviderNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("ProviderProfile", id);
  }
}

/** §6.10 — a runtime never receives another workspace's work. */
export class WorkerNotAttachedError extends DomainError {
  constructor(hostname: string, workspaceId: string) {
    super(
      `Machine "${hostname}" does not serve this workspace — attach it first (§6.3)`,
    );
    void workspaceId;
  }
}

/** §4.14 — a provider that is out of quota cannot take new work. */
export class ProviderUnavailableError extends DomainError {
  constructor(provider: string, reason: string | null) {
    super(
      `Provider "${provider}" is not available${reason ? `: ${reason}` : ""} (§4.14)`,
    );
  }
}
