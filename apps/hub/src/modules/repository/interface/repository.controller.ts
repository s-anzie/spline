import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { ActorIdentity } from "../../identity/application/permissions.service";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import {
  DecideMergeUseCase,
  RequestMergeUseCase,
} from "../application/merge.use-cases";
import {
  ArchiveWorktreeUseCase,
  OpenBranchUseCase,
  OpenWorktreeUseCase,
  RegisterRepositoryUseCase,
} from "../application/repository.use-cases";
import { Branch } from "../domain/branch";
import { MergeRequest } from "../domain/merge-request";
import { Repository } from "../domain/repository";
import { Worktree } from "../domain/worktree";
import { RepositoryReadService } from "../application/repository-read.service";

export class RegisterRepositoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  origin!: string;

  /**
   * §8.3 — where the project lives on the machines that work in it.
   *
   * Optional: a machine with nowhere named picks a place of its own and
   * clones there. Given, it is used as it stands — an operator knows where
   * their project is, dependencies installed and all, and that copy is the
   * environment the work actually needs.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  localPath?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  defaultBranch?: string;

  /** A workspace protects more branches; it never protects fewer (§8.11). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  protectedBranches?: string[];
}

export class OpenBranchDto {
  @IsIn(["TASK", "GOAL", "AGENT"])
  kind!: "TASK" | "GOAL" | "AGENT";

  /** The name is derived from this — never supplied (§8.3). */
  @IsString()
  @IsNotEmpty()
  sourceId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taskId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  goalId?: string;
}

export class OpenWorktreeDto {
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsString()
  @IsNotEmpty()
  taskId!: string;

  @IsString()
  @IsNotEmpty()
  path!: string;
}

export class RequestMergeDto {
  @IsString()
  @IsNotEmpty()
  sourceBranchId!: string;

  @IsString()
  @IsNotEmpty()
  targetBranchId!: string;

  @IsString()
  @IsNotEmpty()
  taskId!: string;
}

export class DecideMergeDto {
  @IsIn(["APPROVE", "REJECT"])
  decision!: "APPROVE" | "REJECT";

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;
}

export class ListQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  limit?: number;
}

function toRepositoryView(repository: Repository) {
  return {
    id: repository.id.value,
    workspaceId: repository.workspaceId,
    name: repository.name,
    origin: repository.origin,
    localPath: repository.localPath,
    defaultBranch: repository.defaultBranch,
    /** Computed, so configuration can never shrink it below §8.3. */
    protectedBranches: repository.protectedBranches,
    status: repository.status,
    createdAt: repository.createdAt.toISOString(),
  };
}

function toBranchView(branch: Branch) {
  return {
    id: branch.id.value,
    repositoryId: branch.repositoryId,
    name: branch.name,
    kind: branch.kind,
    taskId: branch.taskId,
    goalId: branch.goalId,
    status: branch.status,
    protected: branch.isProtected,
  };
}

function toWorktreeView(worktree: Worktree) {
  return {
    id: worktree.id.value,
    repositoryId: worktree.repositoryId,
    branchId: worktree.branchId,
    taskId: worktree.taskId,
    path: worktree.path,
    status: worktree.status,
  };
}

function toMergeView(request: MergeRequest) {
  return {
    id: request.id.value,
    repositoryId: request.repositoryId,
    sourceBranchId: request.sourceBranchId,
    targetBranchId: request.targetBranchId,
    taskId: request.taskId,
    status: request.status,
    requestedBy: {
      type: request.requestedBy.type,
      id: request.requestedBy.actorId,
    },
    decidedBy: request.decidedBy
      ? { type: request.decidedBy.type, id: request.decidedBy.actorId }
      : null,
    decisionReason: request.decisionReason,
    /** §20.6 — the affordances, before the caller hits a refusal. */
    allowedStatusTargets: request.allowedStatusTargets(),
  };
}

@Controller("workspaces/:workspaceId/repositories")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class RepositoryController {
  constructor(
    private readonly register: RegisterRepositoryUseCase,
    private readonly openBranch: OpenBranchUseCase,
    private readonly openWorktree: OpenWorktreeUseCase,
    private readonly archiveWorktree: ArchiveWorktreeUseCase,
    private readonly requestMerge: RequestMergeUseCase,
    private readonly decideMerge: DecideMergeUseCase,
    private readonly reads: RepositoryReadService,
  ) {}

  /** Registering a repository is a workspace decision, not agent work. */
  @Post()
  @RequirePermission("manage_workspace")
  async add(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: RegisterRepositoryDto,
  ): Promise<{ repositoryId: string }> {
    const result = await this.register.execute({ workspaceId, ...dto });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
  }

  @Get()
  @RequirePermission("read_workspace_state")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListQueryDto,
  ) {
    const result = await this.reads.listRepositories(workspaceId, query.limit);
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value.map(toRepositoryView);
  }

  @Get(":repositoryId")
  @RequirePermission("read_workspace_state")
  async one(
    @Param("workspaceId") workspaceId: string,
    @Param("repositoryId") repositoryId: string,
  ) {
    const result = await this.reads.getRepository(workspaceId, repositoryId);
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return toRepositoryView(result.value);
  }

  /** Opening a working branch is execution, and the name follows (§8.3). */
  @Post(":repositoryId/branches")
  @RequirePermission("execute_tasks")
  async branch(
    @Param("workspaceId") workspaceId: string,
    @Param("repositoryId") repositoryId: string,
    @Body() dto: OpenBranchDto,
  ): Promise<{ branchId: string }> {
    const result = await this.openBranch.execute({ workspaceId, repositoryId, ...dto });
    if (result.isFailure) {
      throw toHttpException(result.error, { forbidden: ["ProtectedBranchError"] });
    }
    return result.value;
  }

  @Get(":repositoryId/branches")
  @RequirePermission("read_workspace_state")
  async branches(
    @Param("workspaceId") workspaceId: string,
    @Param("repositoryId") repositoryId: string,
    @Query() query: ListQueryDto,
  ) {
    const result = await this.reads.listBranches(workspaceId, repositoryId, query.limit);
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value.map(toBranchView);
  }

  @Post(":repositoryId/worktrees")
  @RequirePermission("execute_tasks")
  async worktree(
    @Param("workspaceId") workspaceId: string,
    @Param("repositoryId") repositoryId: string,
    @Body() dto: OpenWorktreeDto,
  ): Promise<{ worktreeId: string }> {
    const result = await this.openWorktree.execute({
      workspaceId,
      repositoryId,
      ...dto,
    });
    if (result.isFailure) {
      // Two tasks never share a worktree: a state conflict, not a bad request.
      throw toHttpException(result.error, {
        conflicts: ["WorktreeAlreadyOpenError"],
      });
    }
    return result.value;
  }

  @Get(":repositoryId/worktrees")
  @RequirePermission("read_workspace_state")
  async worktrees(
    @Param("workspaceId") workspaceId: string,
    @Param("repositoryId") repositoryId: string,
    @Query() query: ListQueryDto,
  ) {
    const result = await this.reads.listWorktrees(workspaceId, repositoryId, query.limit);
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value.map(toWorktreeView);
  }

  @Post(":repositoryId/worktrees/:worktreeId/archive")
  @HttpCode(200)
  @RequirePermission("execute_tasks")
  async archive(
    @Param("workspaceId") workspaceId: string,
    @Param("repositoryId") repositoryId: string,
    @Param("worktreeId") worktreeId: string,
  ): Promise<{ ok: true }> {
    const result = await this.archiveWorktree.execute({
      workspaceId,
      repositoryId,
      worktreeId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return { ok: true };
  }

  /** Asking for a merge is ordinary work; deciding one is not (§8.7). */
  @Post(":repositoryId/merges")
  @RequirePermission("execute_tasks")
  async merge(
    @Param("workspaceId") workspaceId: string,
    @Param("repositoryId") repositoryId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: RequestMergeDto,
  ): Promise<{ mergeRequestId: string }> {
    const result = await this.requestMerge.execute({
      workspaceId,
      repositoryId,
      ...dto,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
  }

  @Get(":repositoryId/merges")
  @RequirePermission("read_workspace_state")
  async merges(
    @Param("workspaceId") workspaceId: string,
    @Param("repositoryId") repositoryId: string,
    @Query() query: ListQueryDto,
  ) {
    const result = await this.reads.listMerges(workspaceId, repositoryId, query.limit);
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value.map(toMergeView);
  }

  /**
   * §8.7 — "jamais réalisé par un agent". `approve_validation` is the
   * permission the matrix structurally refuses to every agent role, so the
   * rule rests on the same invariant that stops an agent validating its own
   * work rather than on a second, parallel check.
   */
  @Post(":repositoryId/merges/:mergeRequestId/decide")
  @HttpCode(200)
  @RequirePermission("approve_validation")
  async decide(
    @Param("workspaceId") workspaceId: string,
    @Param("repositoryId") repositoryId: string,
    @Param("mergeRequestId") mergeRequestId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: DecideMergeDto,
  ): Promise<{ ok: true }> {
    const result = await this.decideMerge.execute({
      workspaceId,
      repositoryId,
      mergeRequestId,
      decision: dto.decision,
      reason: dto.reason,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
    if (result.isFailure) {
      // Unmet conditions are a state conflict: the same call succeeds once
      // the proof lands (§8.7).
      throw toHttpException(result.error, { conflicts: ["MergeNotAllowedError"] });
    }
    return { ok: true };
  }
}
