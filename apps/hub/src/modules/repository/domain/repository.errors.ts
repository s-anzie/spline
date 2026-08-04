import { DomainError } from "../../../kernel/domain/domain-error";
import { EntityNotFoundError } from "../../../kernel/domain/errors";

export class RepositoryNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Repository", id);
  }
}

export class BranchNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Branch", id);
  }
}

export class MergeRequestNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("MergeRequest", id);
  }
}

/** §8.3 / §8.11 — no task ever works directly on a protected branch. */
export class ProtectedBranchError extends DomainError {
  constructor(name: string) {
    super(
      `"${name}" is a protected branch: no task works on it directly (§8.3), and it cannot be deleted or rewritten (§8.11)`,
    );
  }
}

/** §8.4 — two tasks never share a worktree. */
export class WorktreeAlreadyOpenError extends DomainError {
  constructor(taskId: string) {
    super(`Task "${taskId}" already has a worktree — two tasks never share one (§8.4)`);
  }
}

/**
 * §8.7 — the merge conditions, named. Reporting which one failed is what
 * lets a caller act; "not allowed" alone is a dead end (§17.8).
 */
export class MergeNotAllowedError extends DomainError {
  constructor(readonly unmet: readonly string[]) {
    super(`This merge is not allowed yet (§8.7): ${unmet.join("; ")}`);
  }
}
