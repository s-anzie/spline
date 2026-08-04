import { Branch } from "../branch";
import { MergeRequest } from "../merge-request";
import { Repository } from "../repository";
import { Worktree } from "../worktree";

export interface ListRepositoriesFilter {
  /** Mandatory (§4.2). */
  workspaceId: string;
  limit?: number;
}

export interface RepositoryStore {
  save(repository: Repository): Promise<void>;
  findById(id: string): Promise<Repository | null>;
  list(filter: ListRepositoriesFilter): Promise<Repository[]>;
}
export const REPOSITORY_STORE = "repository/RepositoryStore";

export interface BranchStore {
  save(branch: Branch): Promise<void>;
  findById(id: string): Promise<Branch | null>;
  findByName(repositoryId: string, name: string): Promise<Branch | null>;
  list(repositoryId: string, limit?: number): Promise<Branch[]>;
}
export const BRANCH_STORE = "repository/BranchStore";

/** Raised when the database refuses a second open worktree for one task. */
export class WorktreeAlreadyOpenInStoreError extends Error {}

export interface WorktreeStore {
  /** Throws WorktreeAlreadyOpenInStoreError when §8.4 would be broken. */
  save(worktree: Worktree): Promise<void>;
  findById(id: string): Promise<Worktree | null>;
  findOpenForTask(repositoryId: string, taskId: string): Promise<Worktree | null>;
  list(repositoryId: string, limit?: number): Promise<Worktree[]>;
}
export const WORKTREE_STORE = "repository/WorktreeStore";

export interface MergeRequestStore {
  save(request: MergeRequest): Promise<void>;
  findById(id: string): Promise<MergeRequest | null>;
  list(repositoryId: string, limit?: number): Promise<MergeRequest[]>;
}
export const MERGE_REQUEST_STORE = "repository/MergeRequestStore";
