import { Inject, Injectable } from "@nestjs/common";

import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { Branch } from "../domain/branch";
import { MergeRequest } from "../domain/merge-request";
import {
  BRANCH_STORE,
  BranchStore,
  MERGE_REQUEST_STORE,
  MergeRequestStore,
  REPOSITORY_STORE,
  RepositoryStore,
  WORKTREE_STORE,
  WorktreeStore,
} from "../domain/ports/repository.repository.port";
import { Repository } from "../domain/repository";
import { RepositoryNotFoundError } from "../domain/repository.errors";
import { Worktree } from "../domain/worktree";

/**
 * The reads, gathered. Four aggregates that only ever get listed within one
 * repository would otherwise be four near-identical use cases whose whole
 * body is "check the workspace owns this repository, then read".
 */
@Injectable()
export class RepositoryReadService {
  constructor(
    @Inject(REPOSITORY_STORE) private readonly repositories: RepositoryStore,
    @Inject(BRANCH_STORE) private readonly branches: BranchStore,
    @Inject(WORKTREE_STORE) private readonly worktrees: WorktreeStore,
    @Inject(MERGE_REQUEST_STORE) private readonly merges: MergeRequestStore,
  ) {}

  async listRepositories(
    workspaceId: string,
    limit?: number,
  ): Promise<Result<Repository[], GuardViolation>> {
    const guarded = Guard.againstEmpty(workspaceId, "workspaceId");
    if (guarded.isFailure) {
      return Result.fail(guarded.error);
    }
    return Result.ok(await this.repositories.list({ workspaceId: guarded.value, limit }));
  }

  async getRepository(
    workspaceId: string,
    repositoryId: string,
  ): Promise<Result<Repository, RepositoryNotFoundError>> {
    const repository = await this.owned(workspaceId, repositoryId);
    return repository
      ? Result.ok(repository)
      : Result.fail(new RepositoryNotFoundError(repositoryId));
  }

  async listBranches(
    workspaceId: string,
    repositoryId: string,
    limit?: number,
  ): Promise<Result<Branch[], RepositoryNotFoundError>> {
    if (!(await this.owned(workspaceId, repositoryId))) {
      return Result.fail(new RepositoryNotFoundError(repositoryId));
    }
    return Result.ok(await this.branches.list(repositoryId, limit));
  }

  async listWorktrees(
    workspaceId: string,
    repositoryId: string,
    limit?: number,
  ): Promise<Result<Worktree[], RepositoryNotFoundError>> {
    if (!(await this.owned(workspaceId, repositoryId))) {
      return Result.fail(new RepositoryNotFoundError(repositoryId));
    }
    return Result.ok(await this.worktrees.list(repositoryId, limit));
  }

  async listMerges(
    workspaceId: string,
    repositoryId: string,
    limit?: number,
  ): Promise<Result<MergeRequest[], RepositoryNotFoundError>> {
    if (!(await this.owned(workspaceId, repositoryId))) {
      return Result.fail(new RepositoryNotFoundError(repositoryId));
    }
    return Result.ok(await this.merges.list(repositoryId, limit));
  }

  /** A repository from another workspace is absent, never forbidden (§4.2). */
  private async owned(
    workspaceId: string,
    repositoryId: string,
  ): Promise<Repository | null> {
    const repository = await this.repositories.findById(repositoryId);
    return repository && repository.workspaceId === workspaceId ? repository : null;
  }
}
