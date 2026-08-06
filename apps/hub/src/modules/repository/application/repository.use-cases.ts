import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { TASK_REPOSITORY, TaskRepository } from "../../task/domain/ports/task.repository.port";
import { TaskNotFoundError } from "../../task/domain/task.errors";
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../../workspace/domain/ports/workspace.repository.port";
import { WorkspaceNotFoundError } from "../../workspace/domain/workspace.errors";
import { Branch, BranchKind } from "../domain/branch";
import { Repository } from "../domain/repository";
import {
  BRANCH_STORE,
  BranchStore,
  REPOSITORY_STORE,
  RepositoryStore,
  WORKTREE_STORE,
  WorktreeAlreadyOpenInStoreError,
  WorktreeStore,
} from "../domain/ports/repository.repository.port";
import {
  ProtectedBranchError,
  RepositoryNotFoundError,
  WorktreeAlreadyOpenError,
} from "../domain/repository.errors";
import { Worktree } from "../domain/worktree";

export interface RegisterRepositoryInput {
  workspaceId: string;
  name: string;
  /** Empty when the project exists only on disk. */
  origin?: string;
  /** §8.3 — where it lives on the machines that work in it. */
  localPath?: string;
  defaultBranch?: string;
  protectedBranches?: readonly string[];
}

@Injectable()
export class RegisterRepositoryUseCase
  implements
    UseCase<
      RegisterRepositoryInput,
      Result<{ repositoryId: string }, GuardViolation | WorkspaceNotFoundError>
    >
{
  constructor(
    @Inject(REPOSITORY_STORE) private readonly repositories: RepositoryStore,
    @Inject(BRANCH_STORE) private readonly branches: BranchStore,
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: RegisterRepositoryInput,
  ): Promise<Result<{ repositoryId: string }, GuardViolation | WorkspaceNotFoundError>> {
    const workspace = await this.workspaces.findById(input.workspaceId);
    if (!workspace) {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }

    const now = this.clock.now();
    const repository = Repository.register({
      workspaceId: input.workspaceId,
      name: input.name,
      origin: input.origin,
      localPath: input.localPath,
      defaultBranch: input.defaultBranch,
      extraProtectedBranches: input.protectedBranches,
      now,
    });
    if (repository.isFailure) {
      return Result.fail(repository.error);
    }
    await this.repositories.save(repository.value);
    await flushDomainEvents(repository.value, this.publisher);

    // The default branch is recorded as a PROTECTED branch straight away, so
    // §8.11 has something concrete to refuse a push against rather than a
    // name that exists only in configuration.
    const main = Branch.adopt({
      repositoryId: repository.value.id.value,
      workspaceId: input.workspaceId,
      name: repository.value.defaultBranch,
      kind: "PROTECTED",
      protectedBranches: repository.value.protectedBranches,
      now,
    });
    if (main.isSuccess) {
      await this.branches.save(main.value);
      await flushDomainEvents(main.value, this.publisher);
    }

    return Result.ok({ repositoryId: repository.value.id.value });
  }
}

export interface OpenBranchInput {
  workspaceId: string;
  repositoryId: string;
  kind: Exclude<BranchKind, "PROTECTED">;
  sourceId: string;
  taskId?: string;
  goalId?: string;
}

export type OpenBranchError =
  | GuardViolation
  | RepositoryNotFoundError
  | TaskNotFoundError
  | ProtectedBranchError;

/** §8.3 — the name follows from what the branch is for; it is never supplied. */
@Injectable()
export class OpenBranchUseCase
  implements UseCase<OpenBranchInput, Result<{ branchId: string }, OpenBranchError>>
{
  constructor(
    @Inject(REPOSITORY_STORE) private readonly repositories: RepositoryStore,
    @Inject(BRANCH_STORE) private readonly branches: BranchStore,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: OpenBranchInput,
  ): Promise<Result<{ branchId: string }, OpenBranchError>> {
    const repository = await this.repositories.findById(input.repositoryId);
    if (!repository || repository.workspaceId !== input.workspaceId) {
      return Result.fail(new RepositoryNotFoundError(input.repositoryId));
    }
    if (input.taskId !== undefined) {
      const task = await this.tasks.findById(input.taskId);
      if (!task || task.workspaceId !== input.workspaceId) {
        return Result.fail(new TaskNotFoundError(input.taskId));
      }
    }

    const branch = Branch.open({
      repositoryId: repository.id.value,
      workspaceId: input.workspaceId,
      kind: input.kind,
      sourceId: input.sourceId,
      taskId: input.taskId,
      goalId: input.goalId,
      protectedBranches: repository.protectedBranches,
      now: this.clock.now(),
    });
    if (branch.isFailure) {
      return Result.fail(branch.error);
    }

    // Opening the same branch twice is the same branch, not a second one.
    const existing = await this.branches.findByName(
      repository.id.value,
      branch.value.name,
    );
    if (existing) {
      return Result.ok({ branchId: existing.id.value });
    }

    await this.branches.save(branch.value);
    await flushDomainEvents(branch.value, this.publisher);
    return Result.ok({ branchId: branch.value.id.value });
  }
}

export interface OpenWorktreeInput {
  workspaceId: string;
  repositoryId: string;
  branchId: string;
  taskId: string;
  path: string;
}

export type OpenWorktreeError =
  | GuardViolation
  | RepositoryNotFoundError
  | TaskNotFoundError
  | WorktreeAlreadyOpenError;

/** §8.4 — one open worktree per task, and the database is the arbiter. */
@Injectable()
export class OpenWorktreeUseCase
  implements UseCase<OpenWorktreeInput, Result<{ worktreeId: string }, OpenWorktreeError>>
{
  constructor(
    @Inject(REPOSITORY_STORE) private readonly repositories: RepositoryStore,
    @Inject(WORKTREE_STORE) private readonly worktrees: WorktreeStore,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: OpenWorktreeInput,
  ): Promise<Result<{ worktreeId: string }, OpenWorktreeError>> {
    const repository = await this.repositories.findById(input.repositoryId);
    if (!repository || repository.workspaceId !== input.workspaceId) {
      return Result.fail(new RepositoryNotFoundError(input.repositoryId));
    }
    const task = await this.tasks.findById(input.taskId);
    if (!task || task.workspaceId !== input.workspaceId) {
      return Result.fail(new TaskNotFoundError(input.taskId));
    }

    const worktree = Worktree.open({
      repositoryId: repository.id.value,
      workspaceId: input.workspaceId,
      branchId: input.branchId,
      taskId: input.taskId,
      path: input.path,
      now: this.clock.now(),
    });
    if (worktree.isFailure) {
      return Result.fail(worktree.error);
    }

    try {
      await this.worktrees.save(worktree.value);
    } catch (error) {
      // The database refused a second open worktree for this task. Reported
      // as the domain rule it is, not as a 500 (§8.4).
      if (error instanceof WorktreeAlreadyOpenInStoreError) {
        return Result.fail(new WorktreeAlreadyOpenError(input.taskId));
      }
      throw error;
    }
    await flushDomainEvents(worktree.value, this.publisher);
    return Result.ok({ worktreeId: worktree.value.id.value });
  }
}

export interface ArchiveWorktreeInput {
  workspaceId: string;
  repositoryId: string;
  worktreeId: string;
}

/** §8.5 ends on Archive, and archiving frees the task's slot. */
@Injectable()
export class ArchiveWorktreeUseCase
  implements UseCase<ArchiveWorktreeInput, Result<void, RepositoryNotFoundError>>
{
  constructor(
    @Inject(REPOSITORY_STORE) private readonly repositories: RepositoryStore,
    @Inject(WORKTREE_STORE) private readonly worktrees: WorktreeStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: ArchiveWorktreeInput,
  ): Promise<Result<void, RepositoryNotFoundError>> {
    const repository = await this.repositories.findById(input.repositoryId);
    if (!repository || repository.workspaceId !== input.workspaceId) {
      return Result.fail(new RepositoryNotFoundError(input.repositoryId));
    }
    const worktree = await this.worktrees.findById(input.worktreeId);
    if (!worktree || worktree.repositoryId !== repository.id.value) {
      return Result.fail(new RepositoryNotFoundError(input.worktreeId));
    }

    worktree.archive(this.clock.now());
    await this.worktrees.save(worktree);
    await flushDomainEvents(worktree, this.publisher);
    return Result.ok(undefined);
  }
}

export interface ActorInput {
  actorType: ActorType;
  actorId: string;
}

export function actorOf(input: ActorInput): Result<ActorRef, GuardViolation> {
  return ActorRef.create(input.actorType, input.actorId);
}
