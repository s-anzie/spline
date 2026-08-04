import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ProtectedBranchError } from "./repository.errors";

/**
 * §8.3 gives three working shapes, plus the branches a repository protects.
 * PROTECTED is not a fourth shape an agent can ask for — it is how the
 * repository records `main` and its kin.
 */
export const BRANCH_KINDS = ["TASK", "GOAL", "AGENT", "PROTECTED"] as const;
export type BranchKind = (typeof BRANCH_KINDS)[number];

export const BRANCH_STATUSES = ["OPEN", "MERGED", "CLOSED"] as const;
export type BranchStatus = (typeof BRANCH_STATUSES)[number];

/** §8.3 names these three. A workspace policy may add, never remove (§8.11). */
export const DEFAULT_PROTECTED_BRANCHES = ["main", "master", "develop"] as const;

const PREFIX: Record<Exclude<BranchKind, "PROTECTED">, string> = {
  TASK: "task",
  GOAL: "goal",
  AGENT: "agent",
};

/**
 * §8.3 — the name is DERIVED, never supplied.
 *
 * A free string would let `main` be created by accident and force the rule to
 * be re-checked at every call site. Derived, the rule is not a check at all:
 * it is the only way to obtain a name, and `task/main` is harmless.
 */
export function branchNameFor(input: {
  kind: Exclude<BranchKind, "PROTECTED">;
  id: string;
}): string {
  return `${PREFIX[input.kind]}/${input.id}`;
}

export class BranchCreated extends BaseDomainEvent {
  readonly eventName = "repository.branch_created";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string | null,
    readonly repositoryId: string,
    readonly name: string,
    readonly kind: BranchKind,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

interface BranchProps {
  repositoryId: string;
  workspaceId: string | null;
  name: string;
  kind: BranchKind;
  taskId: string | null;
  goalId: string | null;
  status: BranchStatus;
  createdAt: Date;
}

export interface OpenBranchProps {
  repositoryId: string;
  workspaceId?: string | null;
  kind: Exclude<BranchKind, "PROTECTED">;
  /** The task, goal or session the branch is for — it becomes the name. */
  sourceId: string;
  taskId?: string | null;
  goalId?: string | null;
  protectedBranches: readonly string[];
  now: Date;
}

export interface AdoptBranchProps {
  repositoryId: string;
  workspaceId?: string | null;
  name: string;
  kind: BranchKind;
  taskId?: string | null;
  goalId?: string | null;
  protectedBranches: readonly string[];
  now: Date;
}

export class Branch extends AggregateRoot<BranchProps> {
  /** The ordinary door: a working branch, named after what it is for. */
  static open(
    input: OpenBranchProps,
  ): Result<Branch, GuardViolation | ProtectedBranchError> {
    const sourceId = Guard.againstEmpty(input.sourceId, "sourceId");
    if (sourceId.isFailure) {
      return Result.fail(sourceId.error);
    }
    return Branch.adopt({
      ...input,
      name: branchNameFor({ kind: input.kind, id: sourceId.value }),
    });
  }

  /**
   * For a name that already exists in the repository — its default branch and
   * the ones it protects. Still refuses to hand a protected name to a task.
   */
  static adopt(
    input: AdoptBranchProps,
    id?: UniqueEntityId,
  ): Result<Branch, GuardViolation | ProtectedBranchError> {
    const repositoryId = Guard.againstEmpty(input.repositoryId, "repositoryId");
    if (repositoryId.isFailure) {
      return Result.fail(repositoryId.error);
    }
    const name = Guard.againstEmpty(input.name, "name");
    if (name.isFailure) {
      return Result.fail(name.error);
    }
    if (input.kind !== "PROTECTED" && input.protectedBranches.includes(name.value)) {
      return Result.fail(new ProtectedBranchError(name.value));
    }

    const branch = new Branch(
      {
        repositoryId: repositoryId.value,
        workspaceId: input.workspaceId ?? null,
        name: name.value,
        kind: input.kind,
        taskId: input.taskId ?? null,
        goalId: input.goalId ?? null,
        status: "OPEN",
        createdAt: input.now,
      },
      id,
    );
    branch.addDomainEvent(
      new BranchCreated(
        branch.id.value,
        input.now,
        branch.workspaceId,
        repositoryId.value,
        name.value,
        input.kind,
      ),
    );
    return Result.ok(branch);
  }

  static reconstitute(props: BranchProps, id: string): Branch {
    return new Branch(props, new UniqueEntityId(id));
  }

  get repositoryId(): string {
    return this.props.repositoryId;
  }

  get workspaceId(): string | null {
    return this.props.workspaceId;
  }

  get name(): string {
    return this.props.name;
  }

  get kind(): BranchKind {
    return this.props.kind;
  }

  get taskId(): string | null {
    return this.props.taskId;
  }

  get goalId(): string | null {
    return this.props.goalId;
  }

  get status(): BranchStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get isProtected(): boolean {
    return this.props.kind === "PROTECTED";
  }

  /** Idempotent, and refused on a protected branch (§8.11). */
  close(now: Date): Result<void, ProtectedBranchError> {
    if (this.isProtected) {
      return Result.fail(new ProtectedBranchError(this.props.name));
    }
    if (this.props.status === "OPEN") {
      this.props.status = "CLOSED";
    }
    void now;
    return Result.ok(undefined);
  }

  markMerged(): void {
    this.props.status = "MERGED";
  }
}
