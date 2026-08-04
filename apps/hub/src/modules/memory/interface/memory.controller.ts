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
import { ActorIdentity } from "../../identity/application/permissions.service";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import {
  ForgetUseCase,
  GetMemoryEntryUseCase,
  ReadContextUseCase,
  RememberUseCase,
  SearchMemoryUseCase,
} from "../application/memory.use-cases";
import { ReconstructMemoryUseCase } from "../application/reconstruct-memory.use-case";
import { MemoryEntry } from "../domain/memory-entry";
import {
  ReadContextQueryDto,
  RememberDto,
  SearchMemoryQueryDto,
} from "./dto/memory.dtos";

function toView(entry: MemoryEntry) {
  return {
    id: entry.id.value,
    scope: { type: entry.scopeType, id: entry.scopeId },
    type: entry.type,
    title: entry.title,
    content: entry.content,
    /**
     * A pointer, never a copy (§16 opening). Deliberately NOT resolved here:
     * a dead reference shows as a dead reference rather than being filtered
     * away, because memory is not the source of truth and has no business
     * pretending to be up to date.
     */
    source: entry.sourceId
      ? { type: entry.sourceType, id: entry.sourceId }
      : null,
    tags: entry.tags,
    author: { type: entry.author.type, id: entry.author.actorId },
    supersededById: entry.supersededById,
    current: entry.isCurrent,
    createdAt: entry.createdAt.toISOString(),
  };
}

@Controller("workspaces/:workspaceId/memory")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class MemoryController {
  constructor(
    private readonly remember: RememberUseCase,
    private readonly forget: ForgetUseCase,
    private readonly readContext: ReadContextUseCase,
    private readonly search: SearchMemoryUseCase,
    private readonly getEntry: GetMemoryEntryUseCase,
    private readonly reconstruct: ReconstructMemoryUseCase,
  ) {}

  /**
   * Writing to memory is ordinary work, not administration: an agent noting
   * what it learned is the point of the module (§10.7-10.8). But it IS a
   * write — `read_workspace_state` here let a VIEWER and a READ_ONLY_AGENT
   * add to a workspace's memory (§18.1).
   */
  @Post()
  @RequirePermission("contribute_knowledge")
  async write(
    @Param("workspaceId") workspaceId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: RememberDto,
  ): Promise<{ entryId: string }> {
    const result = await this.remember.execute({
      workspaceId,
      scopeType: dto.scopeType,
      scopeId: dto.scopeId,
      type: dto.type,
      title: dto.title,
      content: dto.content,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      tags: dto.tags,
      supersedes: dto.supersedes,
      authorType: actor.actorType,
      authorId: actor.actorId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
  }

  /**
   * §16.2 — the stacked context, general to specific, in ONE request: this is
   * what an agent loads at "Synchronize" (§10.3) before it does anything.
   */
  @Get("context")
  @RequirePermission("read_workspace_state")
  async context(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ReadContextQueryDto,
  ) {
    const result = await this.readContext.execute({ workspaceId, ...query });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return {
      levels: result.value.levels.map((level) => ({
        scope: { type: level.scopeType, id: level.scopeId },
        entries: level.entries.map(toView),
        // Never a silent cut: a truncated level that looked complete would
        // read as "that is all there is" (§17.8).
        truncated: level.truncated,
        total: level.total,
      })),
    };
  }

  /** §16.9 — the indexed surface. */
  @Get()
  @RequirePermission("read_workspace_state")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query() query: SearchMemoryQueryDto,
  ) {
    const result = await this.search.execute({
      workspaceId,
      scopeType: query.scopeType,
      scopeId: query.scopeId,
      type: query.type,
      tag: query.tag,
      includeSuperseded: query.includeSuperseded,
      limit: query.limit,
      authorType: query.authorType,
      authorId: query.authorId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value.map(toView);
  }

  @Get(":entryId")
  @RequirePermission("read_workspace_state")
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

  /** Safe by construction — nothing in the domain depends on a note. */
  @Post(":entryId/forget")
  @HttpCode(200)
  @RequirePermission("contribute_knowledge")
  async drop(
    @Param("workspaceId") workspaceId: string,
    @Param("entryId") entryId: string,
  ): Promise<{ ok: true }> {
    const result = await this.forget.execute({ workspaceId, entryId });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return { ok: true };
  }

  /**
   * §16.10. Administrative because it rewrites a whole workspace's memory,
   * and because being able to run it is the proof that memory is disposable.
   */
  @Post("reconstruct")
  @HttpCode(200)
  @RequirePermission("manage_workspace")
  async rebuild(
    @Param("workspaceId") workspaceId: string,
    @CurrentActor() actor: ActorIdentity,
  ) {
    const result = await this.reconstruct.execute({
      workspaceId,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
  }
}
