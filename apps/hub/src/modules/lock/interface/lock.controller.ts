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

import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { ActorIdentity, PermissionsService } from "../../identity/application/permissions.service";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import { AcquireLockUseCase } from "../application/acquire-lock.use-case";
import {
  GetLockUseCase,
  ListLocksUseCase,
} from "../application/list-locks.use-case";
import { ManageLockUseCase } from "../application/manage-lock.use-case";
import { ResourceLock } from "../domain/resource-lock";
import { AcquireLockDto, ListLocksQueryDto, ManageLockDto } from "./dto/lock.dtos";

function toView(lock: ResourceLock, active: boolean) {
  return {
    id: lock.id.value,
    workspaceId: lock.workspaceId,
    resource: { type: lock.resourceType, id: lock.resourceId },
    owner: { type: lock.owner.type, id: lock.owner.actorId },
    reason: lock.reason,
    status: lock.status,
    /** Computed at read (§13.5) — a stored status can lag, a lease cannot. */
    active,
    acquiredAt: lock.acquiredAt.toISOString(),
    expiresAt: lock.expiresAt.toISOString(),
    releasedAt: lock.releasedAt?.toISOString() ?? null,
  };
}

@Controller("workspaces/:workspaceId/locks")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class LockController {
  constructor(
    private readonly acquire: AcquireLockUseCase,
    private readonly manage: ManageLockUseCase,
    private readonly listLocks: ListLocksUseCase,
    private readonly getLock: GetLockUseCase,
    private readonly permissions: PermissionsService,
  ) {}

  @Post()
  @RequirePermission("acquire_locks")
  async take(
    @Param("workspaceId") workspaceId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: AcquireLockDto,
  ) {
    const result = await this.acquire.execute({
      workspaceId,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      reason: dto.reason,
      ttlMs: dto.ttlMs,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
    if (result.isFailure) {
      // A conflict is a state conflict, not a bad request: the same call
      // succeeds unchanged once the holder releases or the lease runs out.
      throw toHttpException(result.error, { conflicts: ["LockConflictError"] });
    }
    return {
      lockId: result.value.lockId,
      expiresAt: result.value.expiresAt.toISOString(),
      reacquired: result.value.reacquired,
    };
  }

  @Get()
  @RequirePermission("read_workspace_state")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListLocksQueryDto,
  ) {
    const result = await this.listLocks.execute({
      workspaceId,
      resourceType: query.resourceType,
      includeInactive: query.includeInactive,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value.map((entry) => toView(entry.lock, entry.active));
  }

  @Get(":lockId")
  @RequirePermission("read_workspace_state")
  async one(
    @Param("workspaceId") workspaceId: string,
    @Param("lockId") lockId: string,
  ) {
    const result = await this.getLock.execute({ workspaceId, lockId });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return toView(result.value.lock, result.value.active);
  }

  /**
   * Renew or release. An operator may force a release — the override is
   * granted here, from a permission the caller actually holds, rather than
   * trusted from the request body.
   */
  @Post(":lockId")
  @HttpCode(200)
  @RequirePermission("acquire_locks")
  async act(
    @Param("workspaceId") workspaceId: string,
    @Param("lockId") lockId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: ManageLockDto,
  ): Promise<{ ok: true }> {
    const canOverride = await this.permissions.can(
      actor,
      "manage_workspace",
      workspaceId,
    );
    const result = await this.manage.execute({
      workspaceId,
      lockId,
      action: dto.action,
      ttlMs: dto.ttlMs,
      actorType: actor.actorType,
      actorId: actor.actorId,
      operatorOverride: canOverride,
    });
    if (result.isFailure) {
      throw toHttpException(result.error, { forbidden: ["LockNotOwnedError"] });
    }
    return { ok: true };
  }
}
