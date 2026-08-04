import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";

import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import {
  GetAuditEntryUseCase,
  ListAuditEntriesUseCase,
  VerifyAuditChainUseCase,
} from "../application/read-audit.use-cases";
import { AuditEntry } from "../domain/audit-entry";
import { ListAuditQueryDto } from "./dto/audit.dtos";

function toView(entry: AuditEntry) {
  return {
    id: entry.id.value,
    workspaceId: entry.workspaceId,
    actor: { type: entry.actor.type, id: entry.actor.actorId },
    action: entry.action,
    target: { type: entry.targetType, id: entry.targetId },
    before: entry.before,
    after: entry.after,
    /** A string: a BigInt does not survive JSON. */
    sequence: entry.sequence.toString(),
    signature: entry.signature,
    createdAt: entry.createdAt.toISOString(),
  };
}

/**
 * Read only. There is no write route by design: an audit entry is earned by
 * acting, never declared — an endpoint accepting one would let anyone
 * manufacture a past. And nothing updates or deletes (§4.23).
 */
@Controller("workspaces/:workspaceId/audit")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(
    private readonly listEntries: ListAuditEntriesUseCase,
    private readonly getEntry: GetAuditEntryUseCase,
    private readonly verify: VerifyAuditChainUseCase,
  ) {}

  /**
   * Reading the trail is an administrative act, not ordinary workspace
   * reading: it exposes who changed what, including permissions.
   */
  @Get()
  @RequirePermission("manage_workspace")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListAuditQueryDto,
  ) {
    const result = await this.listEntries.execute({
      workspaceId,
      action: query.action,
      targetType: query.targetType,
      targetId: query.targetId,
      actorType: query.actorType,
      actorId: query.actorId,
      limit: query.limit,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value.map(toView);
  }

  /** §4.23 — "immuable" means detectable, and this is where it is detected. */
  @Get("verify")
  @RequirePermission("manage_workspace")
  async verifyChain(@Param("workspaceId") workspaceId: string) {
    const result = await this.verify.execute({ workspaceId });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return {
      intact: result.value.intact,
      checked: result.value.checked,
      brokenAt: result.value.brokenAt
        ? {
            id: result.value.brokenAt.id,
            sequence: result.value.brokenAt.sequence.toString(),
          }
        : null,
    };
  }

  @Get(":entryId")
  @RequirePermission("manage_workspace")
  async one(
    @Param("workspaceId") workspaceId: string,
    @Param("entryId") entryId: string,
  ) {
    const result = await this.getEntry.execute({ workspaceId, entryId });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return toView(result.value);
  }
}
