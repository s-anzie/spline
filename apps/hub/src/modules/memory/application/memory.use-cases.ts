import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../../workspace/domain/ports/workspace.repository.port";
import { WorkspaceNotFoundError } from "../../workspace/domain/workspace.errors";
import { BuiltContext, buildContext, MemoryContext } from "../domain/context-builder";
import {
  MemoryEntry,
  MemoryEntryShapeError,
  MemoryScopeType,
} from "../domain/memory-entry";
import { MemoryEntryNotFoundError } from "../domain/memory.errors";
import {
  MEMORY_REPOSITORY,
  MemoryRepository,
  SearchMemoryFilter,
} from "../domain/ports/memory.repository.port";

export interface RememberInput {
  workspaceId: string;
  scopeType: MemoryScopeType;
  scopeId: string;
  type: string;
  title: string;
  content?: string;
  sourceType?: string;
  sourceId?: string;
  tags?: readonly string[];
  authorType: ActorType;
  authorId: string;
  /** When set, the new entry replaces that one rather than sitting beside it. */
  supersedes?: string;
}

export type RememberError =
  | GuardViolation
  | WorkspaceNotFoundError
  | MemoryEntryShapeError
  | MemoryEntryNotFoundError;

@Injectable()
export class RememberUseCase
  implements UseCase<RememberInput, Result<{ entryId: string }, RememberError>>
{
  constructor(
    @Inject(MEMORY_REPOSITORY) private readonly memory: MemoryRepository,
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(input: RememberInput): Promise<Result<{ entryId: string }, RememberError>> {
    const workspace = await this.workspaces.findById(input.workspaceId);
    if (!workspace) {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }
    const author = ActorRef.create(input.authorType, input.authorId);
    if (author.isFailure) {
      return Result.fail(author.error);
    }

    // Resolved before writing: superseding something that is not there would
    // otherwise leave a successor pointing at nothing.
    const previous = input.supersedes
      ? await this.memory.findById(input.supersedes)
      : null;
    if (input.supersedes && (!previous || previous.workspaceId !== input.workspaceId)) {
      return Result.fail(new MemoryEntryNotFoundError(input.supersedes));
    }

    const now = this.clock.now();
    const entry = MemoryEntry.remember({ ...input, author: author.value, now });
    if (entry.isFailure) {
      return Result.fail(entry.error);
    }

    await this.memory.save(entry.value);
    await flushDomainEvents(entry.value, this.publisher);

    if (previous) {
      const superseded = previous.supersedeBy(entry.value.id.value, now);
      if (superseded.isFailure) {
        return Result.fail(superseded.error);
      }
      await this.memory.save(previous);
      await flushDomainEvents(previous, this.publisher);
    }

    return Result.ok({ entryId: entry.value.id.value });
  }
}

export interface ForgetInput {
  workspaceId: string;
  entryId: string;
}

/**
 * Safe by construction: §16 makes memory never the source of truth, so
 * nothing in the domain breaks when a note goes. That is the property the
 * whole module is designed to keep true.
 */
@Injectable()
export class ForgetUseCase
  implements UseCase<ForgetInput, Result<void, MemoryEntryNotFoundError>>
{
  constructor(
    @Inject(MEMORY_REPOSITORY) private readonly memory: MemoryRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(input: ForgetInput): Promise<Result<void, MemoryEntryNotFoundError>> {
    const entry = await this.memory.findById(input.entryId);
    if (!entry || entry.workspaceId !== input.workspaceId) {
      return Result.fail(new MemoryEntryNotFoundError(input.entryId));
    }
    entry.forget(this.clock.now());
    await this.memory.save(entry);
    await flushDomainEvents(entry, this.publisher);
    return Result.ok(undefined);
  }
}

/** §16.2 / §10.3-10.4 — what an agent loads before acting, in one request. */
@Injectable()
export class ReadContextUseCase
  implements UseCase<MemoryContext, Result<BuiltContext, GuardViolation>>
{
  constructor(@Inject(MEMORY_REPOSITORY) private readonly memory: MemoryRepository) {}

  async execute(context: MemoryContext): Promise<Result<BuiltContext, GuardViolation>> {
    const workspaceId = Guard.againstEmpty(context.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    const scopes = (
      [
        ["ORGANIZATION", context.organizationId],
        ["WORKSPACE", workspaceId.value],
        ["REPOSITORY", context.repositoryId],
        ["GOAL", context.goalId],
        ["TASK", context.taskId],
        ["RUN", context.runId],
        ["SESSION", context.sessionId],
      ] as const
    )
      .filter((pair): pair is readonly [MemoryScopeType, string] => pair[1] !== undefined)
      .map(([scopeType, scopeId]) => ({ scopeType, scopeId }));

    const entries = await this.memory.listForScopes(workspaceId.value, scopes);
    return Result.ok(
      buildContext(entries, { ...context, workspaceId: workspaceId.value }),
    );
  }
}

export interface SearchMemoryInput extends Omit<SearchMemoryFilter, "author"> {
  authorType?: ActorType;
  authorId?: string;
}

/** §16.9 — the indexed surface: type, date, author, scope, tags. */
@Injectable()
export class SearchMemoryUseCase
  implements UseCase<SearchMemoryInput, Result<MemoryEntry[], GuardViolation>>
{
  constructor(@Inject(MEMORY_REPOSITORY) private readonly memory: MemoryRepository) {}

  async execute(
    input: SearchMemoryInput,
  ): Promise<Result<MemoryEntry[], GuardViolation>> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    // Built here rather than in the controller: an ActorRef is a validated
    // value object, and assembling one at the edge would skip its guard.
    let author: ActorRef | undefined;
    if (input.authorType !== undefined && input.authorId !== undefined) {
      const parsed = ActorRef.create(input.authorType, input.authorId);
      if (parsed.isFailure) {
        return Result.fail(parsed.error);
      }
      author = parsed.value;
    }
    return Result.ok(
      await this.memory.search({ ...input, workspaceId: workspaceId.value, author }),
    );
  }
}

/**
 * An identifier the API hands out must be resolvable through the API. This
 * one is: a view reports `supersededById`, so the entry that
 * replaced this one has to be reachable.
 */
@Injectable()
export class GetMemoryEntryUseCase
  implements
    UseCase<
      { workspaceId: string; entryId: string },
      Result<MemoryEntry, MemoryEntryNotFoundError>
    >
{
  constructor(@Inject(MEMORY_REPOSITORY) private readonly memory: MemoryRepository) {}

  async execute(input: {
    workspaceId: string;
    entryId: string;
  }): Promise<Result<MemoryEntry, MemoryEntryNotFoundError>> {
    const entry = await this.memory.findById(input.entryId);
    if (!entry || entry.workspaceId !== input.workspaceId) {
      return Result.fail(new MemoryEntryNotFoundError(input.entryId));
    }
    return Result.ok(entry);
  }
}
