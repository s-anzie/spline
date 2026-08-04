import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";

export const WORKTREE_STATUSES = ["OPEN", "ARCHIVED"] as const;
export type WorktreeStatus = (typeof WORKTREE_STATUSES)[number];

export class WorktreeCreated extends BaseDomainEvent {
  readonly eventName = "repository.worktree_created";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string | null,
    readonly repositoryId: string,
    readonly taskId: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

interface WorktreeProps {
  repositoryId: string;
  workspaceId: string | null;
  branchId: string;
  taskId: string;
  path: string;
  status: WorktreeStatus;
  createdAt: Date;
  archivedAt: Date | null;
}

export interface OpenWorktreeProps {
  repositoryId: string;
  workspaceId?: string | null;
  branchId: string;
  taskId: string;
  /** Where the Worker will put it. Opaque here — the hub owns no filesystem. */
  path: string;
  now: Date;
}

/**
 * §8.4 — `Repository → Worktree → Task → Run`, and "deux tâches ne partagent
 * jamais le même Worktree".
 *
 * That exclusivity is enforced by a unique index on the open worktree of a
 * task, not by reading before writing: two concurrent requests would both
 * pass a read. Same mechanism as a lock's `activeKey`, and for the same
 * reason — an invariant that only holds when nobody is in a hurry does not
 * hold.
 */
export class Worktree extends AggregateRoot<WorktreeProps> {
  static open(
    input: OpenWorktreeProps,
    id?: UniqueEntityId,
  ): Result<Worktree, GuardViolation> {
    for (const [value, name] of [
      [input.repositoryId, "repositoryId"],
      [input.branchId, "branchId"],
      [input.taskId, "taskId"],
      [input.path, "path"],
    ] as const) {
      const guarded = Guard.againstEmpty(value, name);
      if (guarded.isFailure) {
        return Result.fail(guarded.error);
      }
    }

    const worktree = new Worktree(
      {
        repositoryId: input.repositoryId,
        workspaceId: input.workspaceId ?? null,
        branchId: input.branchId,
        taskId: input.taskId,
        path: input.path,
        status: "OPEN",
        createdAt: input.now,
        archivedAt: null,
      },
      id,
    );
    worktree.addDomainEvent(
      new WorktreeCreated(
        worktree.id.value,
        input.now,
        worktree.workspaceId,
        input.repositoryId,
        input.taskId,
      ),
    );
    return Result.ok(worktree);
  }

  static reconstitute(props: WorktreeProps, id: string): Worktree {
    return new Worktree(props, new UniqueEntityId(id));
  }

  get repositoryId(): string {
    return this.props.repositoryId;
  }

  get workspaceId(): string | null {
    return this.props.workspaceId;
  }

  get branchId(): string {
    return this.props.branchId;
  }

  get taskId(): string {
    return this.props.taskId;
  }

  get path(): string {
    return this.props.path;
  }

  get status(): WorktreeStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get archivedAt(): Date | null {
    return this.props.archivedAt;
  }

  get isOpen(): boolean {
    return this.props.status === "OPEN";
  }

  /** §8.5 ends on Archive. Idempotent, and it frees the task's slot. */
  archive(now: Date): Result<void, never> {
    if (this.props.status === "OPEN") {
      this.props.status = "ARCHIVED";
      this.props.archivedAt = now;
    }
    return Result.ok(undefined);
  }
}
