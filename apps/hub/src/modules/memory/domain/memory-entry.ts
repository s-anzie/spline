import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { DomainError } from "../../../kernel/domain/domain-error";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";

/** §16.2, most general first. REPOSITORY, RUN and SESSION are skipped when absent. */
export const MEMORY_SCOPES = [
  "ORGANIZATION",
  "WORKSPACE",
  "REPOSITORY",
  "GOAL",
  "TASK",
  "RUN",
  "SESSION",
] as const;
export type MemoryScopeType = (typeof MEMORY_SCOPES)[number];

/**
 * An entry says something nobody else holds, or points at something that
 * does. Never both — that is the duplication §16's opening line rules out,
 * and it is where a second, silently ageing version of a decision comes from.
 */
export class MemoryEntryShapeError extends DomainError {
  constructor(reason: string) {
    super(`A memory entry is a note or a reference, never both and never neither: ${reason}`);
  }
}

export class MemoryRemembered extends BaseDomainEvent {
  readonly eventName = "memory.remembered";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly scopeType: MemoryScopeType,
    readonly scopeId: string,
    readonly type: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class MemorySuperseded extends BaseDomainEvent {
  readonly eventName = "memory.superseded";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly supersededById: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class MemoryForgotten extends BaseDomainEvent {
  readonly eventName = "memory.forgotten";

  constructor(aggregateId: string, occurredAt: Date, workspaceId: string) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

interface MemoryProps {
  workspaceId: string;
  scopeType: MemoryScopeType;
  scopeId: string;
  type: string;
  title: string;
  content: string | null;
  sourceType: string | null;
  sourceId: string | null;
  tags: string[];
  author: ActorRef;
  supersededById: string | null;
  forgottenAt: Date | null;
  createdAt: Date;
}

export interface RememberProps {
  workspaceId: string;
  scopeType: MemoryScopeType;
  scopeId: string;
  /** Free string; §16.9 indexes by it. */
  type: string;
  title: string;
  content?: string;
  sourceType?: string;
  sourceId?: string;
  tags?: readonly string[];
  author: ActorRef;
  now: Date;
}

/**
 * §16 — knowledge an agent loads before acting, and **never the source of
 * truth**. The whole design answers one question: can this table be dropped
 * without losing anything? It can, because an entry either holds a note that
 * exists nowhere else, or points at the domain object that does.
 */
export class MemoryEntry extends AggregateRoot<MemoryProps> {
  static remember(
    input: RememberProps,
    id?: UniqueEntityId,
  ): Result<MemoryEntry, GuardViolation | MemoryEntryShapeError> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    const scopeId = Guard.againstEmpty(input.scopeId, "scopeId");
    if (scopeId.isFailure) {
      return Result.fail(scopeId.error);
    }
    const type = Guard.againstEmpty(input.type, "type");
    if (type.isFailure) {
      return Result.fail(type.error);
    }
    const title = Guard.againstEmpty(input.title, "title");
    if (title.isFailure) {
      return Result.fail(title.error);
    }

    const shape = shapeOf(input);
    if (shape.isFailure) {
      return Result.fail(shape.error);
    }

    const entry = new MemoryEntry(
      {
        workspaceId: workspaceId.value,
        scopeType: input.scopeType,
        scopeId: scopeId.value,
        type: type.value,
        title: title.value,
        content: shape.value.content,
        sourceType: shape.value.sourceType,
        sourceId: shape.value.sourceId,
        tags: [...(input.tags ?? [])],
        author: input.author,
        supersededById: null,
        forgottenAt: null,
        createdAt: input.now,
      },
      id,
    );
    entry.addDomainEvent(
      new MemoryRemembered(
        entry.id.value,
        input.now,
        workspaceId.value,
        input.scopeType,
        scopeId.value,
        type.value,
      ),
    );
    return Result.ok(entry);
  }

  static reconstitute(props: MemoryProps, id: string): MemoryEntry {
    return new MemoryEntry(props, new UniqueEntityId(id));
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get scopeType(): MemoryScopeType {
    return this.props.scopeType;
  }

  get scopeId(): string {
    return this.props.scopeId;
  }

  get type(): string {
    return this.props.type;
  }

  get title(): string {
    return this.props.title;
  }

  get content(): string | null {
    return this.props.content;
  }

  get sourceType(): string | null {
    return this.props.sourceType;
  }

  get sourceId(): string | null {
    return this.props.sourceId;
  }

  get tags(): readonly string[] {
    return [...this.props.tags];
  }

  get author(): ActorRef {
    return this.props.author;
  }

  get supersededById(): string | null {
    return this.props.supersededById;
  }

  get forgottenAt(): Date | null {
    return this.props.forgottenAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** A pointer at a domain object rather than a description of it (§1.1). */
  get isReference(): boolean {
    return this.props.sourceId !== null;
  }

  get isForgotten(): boolean {
    return this.props.forgottenAt !== null;
  }

  /** What a reader should be shown today. */
  get isCurrent(): boolean {
    return this.props.supersededById === null && !this.isForgotten;
  }

  /**
   * §16.1 "versionnée" — a correction is a new entry, and this one stays
   * readable. Overwriting would lose why one believed otherwise yesterday,
   * which is frequently the useful part.
   */
  supersedeBy(
    successorId: string,
    now: Date,
  ): Result<void, GuardViolation | MemoryEntryShapeError> {
    const id = Guard.againstEmpty(successorId, "successorId");
    if (id.isFailure) {
      return Result.fail(id.error);
    }
    if (id.value === this.id.value) {
      return Result.fail(new MemoryEntryShapeError("an entry cannot supersede itself"));
    }
    if (this.props.supersededById !== null) {
      return Result.fail(
        new MemoryEntryShapeError(
          `already superseded by "${this.props.supersededById}" — supersede that one instead`,
        ),
      );
    }
    this.props.supersededById = id.value;
    this.addDomainEvent(
      new MemorySuperseded(this.id.value, now, this.props.workspaceId, id.value),
    );
    return Result.ok(undefined);
  }

  /** Safe by construction: nothing in the domain depends on a memory entry. */
  forget(now: Date): Result<void, never> {
    if (this.isForgotten) {
      return Result.ok(undefined);
    }
    this.props.forgottenAt = now;
    this.addDomainEvent(
      new MemoryForgotten(this.id.value, now, this.props.workspaceId),
    );
    return Result.ok(undefined);
  }
}

function shapeOf(
  input: RememberProps,
): Result<
  { content: string | null; sourceType: string | null; sourceId: string | null },
  MemoryEntryShapeError
> {
  const hasContent = (input.content ?? "").trim() !== "";
  const hasType = (input.sourceType ?? "").trim() !== "";
  const hasId = (input.sourceId ?? "").trim() !== "";

  if (hasType !== hasId) {
    return Result.fail(
      new MemoryEntryShapeError("a reference needs both a sourceType and a sourceId"),
    );
  }
  if (hasContent && hasId) {
    return Result.fail(
      new MemoryEntryShapeError(
        "a reference must not carry its own copy of what it points at",
      ),
    );
  }
  if (!hasContent && !hasId) {
    return Result.fail(new MemoryEntryShapeError("neither a note nor a reference"));
  }

  return Result.ok({
    content: hasContent ? input.content!.trim() : null,
    sourceType: hasId ? input.sourceType!.trim() : null,
    sourceId: hasId ? input.sourceId!.trim() : null,
  });
}
