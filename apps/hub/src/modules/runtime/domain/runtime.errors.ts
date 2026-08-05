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

/**
 * §18 — a machine's routes name the machine in their path; only the actor
 * that registered it may use them. Refused as a forbidden act, never as "not
 * found", because the machine does exist and saying otherwise would be a lie
 * the operator has to debug.
 */
export class WorkerImpersonationError extends DomainError {
  constructor(hostname: string) {
    super(`Machine "${hostname}" is operated by another actor (§18)`);
  }
}

export class EnrolmentNotFoundError extends EntityNotFoundError {
  constructor(reference: string) {
    super("WorkerEnrolment", reference);
  }
}

/**
 * §6.3 — a machine asked to join and something about that request no longer
 * holds: the code expired, the decision was already made, or the caller is
 * not the machine that asked.
 */
export class EnrolmentNotClaimableError extends DomainError {
  constructor(reason: string) {
    super(`This enrolment cannot be used: ${reason}`);
  }
}

/**
 * §4.2 and §18.3 — a session names the actor it runs as, and that name came
 * from the request body. An actor that is not a member of this workspace
 * cannot be given one: the entry would attribute work to somebody who never
 * acted, and would cross the isolation §4.2 calls absolute.
 */
export class ActorNotInWorkspaceError extends DomainError {
  constructor(actorId: string) {
    super(`Actor "${actorId}" is not a member of this workspace (§4.2)`);
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

/**
 * §13.7's second path, in a queue: another worker already holds this order.
 * Two workers executing the same command is what a queue exists to prevent.
 */
export class CommandAlreadyClaimedError extends DomainError {
  constructor(readonly heldBy: string) {
    super(`This command is already claimed by "${heldBy}"`);
  }
}
