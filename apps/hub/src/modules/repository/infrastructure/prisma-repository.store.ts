import { Injectable } from "@nestjs/common";
import {
  Branch as BranchRow,
  MergeRequest as MergeRow,
  Prisma,
  Repository as RepositoryRow,
  Worktree as WorktreeRow,
} from "@repo/db";

import { pageSize } from "../../../kernel/domain/pagination";
import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { Branch, BranchKind, BranchStatus } from "../domain/branch";
import { MergeRequest, MergeStatus } from "../domain/merge-request";
import { Repository, RepositoryStatus } from "../domain/repository";
import { Worktree, WorktreeStatus } from "../domain/worktree";
import {
  BranchStore,
  ListRepositoriesFilter,
  MergeRequestStore,
  RepositoryStore,
  WorktreeAlreadyOpenInStoreError,
  WorktreeStore,
} from "../domain/ports/repository.repository.port";

@Injectable()
export class PrismaRepositoryStore implements RepositoryStore {
  constructor(private readonly prisma: PrismaService) {}

  /** §5.19 — the whole aggregate. */
  async save(repository: Repository): Promise<void> {
    const data = {
      workspaceId: repository.workspaceId,
      name: repository.name,
      origin: repository.origin,
      localPath: repository.localPath,
      defaultBranch: repository.defaultBranch,
      // Only what the workspace added: the §8.3 defaults are computed, so a
      // stored copy could never drift from them.
      extraProtectedBranches: repository.protectedBranches.filter(
        (name) =>
          !["main", "master", "develop", repository.defaultBranch].includes(name),
      ),
      status: repository.status,
      createdAt: repository.createdAt,
    };
    await this.prisma.repository.upsert({
      where: { id: repository.id.value },
      create: { id: repository.id.value, ...data },
      update: data,
    });
  }

  async findById(id: string): Promise<Repository | null> {
    const row = await this.prisma.repository.findUnique({ where: { id } });
    return row ? toRepository(row) : null;
  }

  async list(filter: ListRepositoriesFilter): Promise<Repository[]> {
    const rows = await this.prisma.repository.findMany({
      where: { workspaceId: filter.workspaceId },
      orderBy: { createdAt: "desc" },
      take: pageSize(filter.limit),
    });
    return rows.map(toRepository);
  }
}

@Injectable()
export class PrismaBranchStore implements BranchStore {
  constructor(private readonly prisma: PrismaService) {}

  async save(branch: Branch): Promise<void> {
    const data = {
      repositoryId: branch.repositoryId,
      workspaceId: branch.workspaceId,
      name: branch.name,
      kind: branch.kind,
      taskId: branch.taskId,
      goalId: branch.goalId,
      status: branch.status,
      createdAt: branch.createdAt,
    };
    await this.prisma.branch.upsert({
      where: { id: branch.id.value },
      create: { id: branch.id.value, ...data },
      update: data,
    });
  }

  async findById(id: string): Promise<Branch | null> {
    const row = await this.prisma.branch.findUnique({ where: { id } });
    return row ? toBranch(row) : null;
  }

  async findByName(repositoryId: string, name: string): Promise<Branch | null> {
    const row = await this.prisma.branch.findUnique({
      where: { repositoryId_name: { repositoryId, name } },
    });
    return row ? toBranch(row) : null;
  }

  async list(repositoryId: string, limit?: number): Promise<Branch[]> {
    const rows = await this.prisma.branch.findMany({
      where: { repositoryId },
      orderBy: { createdAt: "desc" },
      take: pageSize(limit),
    });
    return rows.map(toBranch);
  }
}

@Injectable()
export class PrismaWorktreeStore implements WorktreeStore {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * §8.4 is enforced by the database, not by a read: `openForTask` carries the
   * task id while open and NULL once archived, under a unique index. Two
   * concurrent requests would both pass a read; only one can pass this.
   */
  async save(worktree: Worktree): Promise<void> {
    const data = {
      repositoryId: worktree.repositoryId,
      workspaceId: worktree.workspaceId,
      branchId: worktree.branchId,
      taskId: worktree.taskId,
      openForTask: worktree.isOpen ? worktree.taskId : null,
      path: worktree.path,
      status: worktree.status,
      createdAt: worktree.createdAt,
      archivedAt: worktree.archivedAt,
    };
    try {
      await this.prisma.worktree.upsert({
        where: { id: worktree.id.value },
        create: { id: worktree.id.value, ...data },
        update: data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new WorktreeAlreadyOpenInStoreError(worktree.taskId);
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Worktree | null> {
    const row = await this.prisma.worktree.findUnique({ where: { id } });
    return row ? toWorktree(row) : null;
  }

  async findOpenForTask(
    repositoryId: string,
    taskId: string,
  ): Promise<Worktree | null> {
    const row = await this.prisma.worktree.findFirst({
      where: { repositoryId, openForTask: taskId },
    });
    return row ? toWorktree(row) : null;
  }

  async list(repositoryId: string, limit?: number): Promise<Worktree[]> {
    const rows = await this.prisma.worktree.findMany({
      where: { repositoryId },
      orderBy: { createdAt: "desc" },
      take: pageSize(limit),
    });
    return rows.map(toWorktree);
  }
}

@Injectable()
export class PrismaMergeRequestStore implements MergeRequestStore {
  constructor(private readonly prisma: PrismaService) {}

  async save(request: MergeRequest): Promise<void> {
    const data = {
      repositoryId: request.repositoryId,
      workspaceId: request.workspaceId,
      sourceBranchId: request.sourceBranchId,
      targetBranchId: request.targetBranchId,
      taskId: request.taskId,
      status: request.status,
      requestedByType: request.requestedBy.type,
      requestedById: request.requestedBy.actorId,
      decidedByType: request.decidedBy?.type ?? null,
      decidedById: request.decidedBy?.actorId ?? null,
      decisionReason: request.decisionReason,
      createdAt: request.createdAt,
      decidedAt: request.decidedAt,
      mergedAt: request.mergedAt,
    };
    await this.prisma.mergeRequest.upsert({
      where: { id: request.id.value },
      create: { id: request.id.value, ...data },
      update: data,
    });
  }

  async findById(id: string): Promise<MergeRequest | null> {
    const row = await this.prisma.mergeRequest.findUnique({ where: { id } });
    return row ? toMergeRequest(row) : null;
  }

  async list(repositoryId: string, limit?: number): Promise<MergeRequest[]> {
    const rows = await this.prisma.mergeRequest.findMany({
      where: { repositoryId },
      orderBy: { createdAt: "desc" },
      take: pageSize(limit),
    });
    return rows.map(toMergeRequest);
  }
}

function toRepository(row: RepositoryRow): Repository {
  return Repository.reconstitute(
    {
      workspaceId: row.workspaceId,
      name: row.name,
      origin: row.origin,
      localPath: row.localPath,
      defaultBranch: row.defaultBranch,
      extraProtectedBranches: (row.extraProtectedBranches ?? []) as string[],
      status: row.status as RepositoryStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    row.id,
  );
}

function toBranch(row: BranchRow): Branch {
  return Branch.reconstitute(
    {
      repositoryId: row.repositoryId,
      workspaceId: row.workspaceId,
      name: row.name,
      kind: row.kind as BranchKind,
      taskId: row.taskId,
      goalId: row.goalId,
      status: row.status as BranchStatus,
      createdAt: row.createdAt,
    },
    row.id,
  );
}

function toWorktree(row: WorktreeRow): Worktree {
  return Worktree.reconstitute(
    {
      repositoryId: row.repositoryId,
      workspaceId: row.workspaceId,
      branchId: row.branchId,
      taskId: row.taskId,
      path: row.path,
      status: row.status as WorktreeStatus,
      createdAt: row.createdAt,
      archivedAt: row.archivedAt,
    },
    row.id,
  );
}

function toMergeRequest(row: MergeRow): MergeRequest {
  return MergeRequest.reconstitute(
    {
      repositoryId: row.repositoryId,
      workspaceId: row.workspaceId,
      sourceBranchId: row.sourceBranchId,
      targetBranchId: row.targetBranchId,
      taskId: row.taskId,
      status: row.status as MergeStatus,
      requestedBy: ActorRef.create(
        row.requestedByType as ActorType,
        row.requestedById,
      ).value,
      decidedBy:
        row.decidedByType && row.decidedById
          ? ActorRef.create(row.decidedByType as ActorType, row.decidedById).value
          : null,
      decisionReason: row.decisionReason,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      mergedAt: row.mergedAt,
    },
    row.id,
  );
}
