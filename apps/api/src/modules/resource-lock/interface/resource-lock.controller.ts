import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import {
  AuthenticatedRequester,
  CurrentRequester,
  JwtAuthGuard,
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface";
import { DomainError } from "../../../kernel/domain/domain-error";
import { AcquireLockUseCase } from "../application/acquire-lock.use-case";
import { ListLocksByWorkspaceUseCase } from "../application/list-locks-by-workspace.use-case";
import { LockNotFoundError, ResourceAlreadyLockedError } from "../application/resource-lock-application.errors";
import { ReleaseLockUseCase } from "../application/release-lock.use-case";
import { ResourceLock } from "../domain/resource-lock";
import {
  EmptyLockResourceIdError,
  InvalidLockExpiryError,
  LockAlreadyReleasedError,
  NotLockOwnerError,
} from "../domain/resource-lock.errors";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { AcquireLockDto } from "./dto/acquire-lock.dto";

function toLockResponse(lock: ResourceLock) {
  return {
    id: lock.id.toString(),
    workspaceId: lock.workspaceId,
    resourceType: lock.resourceType,
    resourceId: lock.resourceId,
    lockedByType: lock.lockedByType,
    lockedById: lock.lockedById,
    lockedAt: lock.lockedAt.toISOString(),
    expiresAt: lock.expiresAt?.toISOString() ?? null,
    reason: lock.reason ?? null,
    scope: lock.scope ?? null,
    releasedAt: lock.releasedAt?.toISOString() ?? null,
    isHeld: lock.isHeld(new Date()),
  };
}

function toHttpError(error: DomainError): Error {
  if (error instanceof WorkspaceNotFoundError || error instanceof LockNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof ResourceAlreadyLockedError || error instanceof LockAlreadyReleasedError) {
    return new ConflictException(error.message);
  }
  if (error instanceof NotLockOwnerError) {
    return new ForbiddenException(error.message);
  }
  if (error instanceof EmptyLockResourceIdError || error instanceof InvalidLockExpiryError) {
    return new BadRequestException(error.message);
  }
  return new BadRequestException(error.message);
}

@Controller("workspaces/:workspaceId/locks")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ResourceLockController {
  constructor(
    private readonly acquireLockUseCase: AcquireLockUseCase,
    private readonly releaseLockUseCase: ReleaseLockUseCase,
    private readonly listLocksByWorkspaceUseCase: ListLocksByWorkspaceUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("acquire_lock")
  async acquire(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: AcquireLockDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.acquireLockUseCase.execute({
      workspaceId,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      reason: dto.reason,
      scope: dto.scope,
      lockedBy: { type: requester.type, id: requester.id },
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toLockResponse(result.value);
  }

  @Get()
  @RequirePermission("read_tasks")
  async list(@Param("workspaceId") workspaceId: string) {
    const locks = await this.listLocksByWorkspaceUseCase.execute(workspaceId);
    return locks.map(toLockResponse);
  }

  @Post(":lockId/release")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("acquire_lock")
  async release(
    @Param("lockId") lockId: string,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.releaseLockUseCase.execute({
      lockId,
      releasedBy: { type: requester.type, id: requester.id },
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toLockResponse(result.value);
  }
}
