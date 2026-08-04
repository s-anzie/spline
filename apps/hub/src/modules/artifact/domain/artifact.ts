import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { StateMachine } from "../../../kernel/domain/state-machine";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { isValidArtifactType } from "./artifact-types";
import { ArtifactVersion, NewArtifactVersion } from "./artifact-version";
import {
  ArtifactCreated,
  ArtifactLinked,
  ArtifactStatusChanged,
  ArtifactUnlinked,
  ArtifactUpdated,
  ArtifactVersioned,
} from "./artifact-events";
import {
  ArtifactNotActiveError,
  ImmutableArtifactError,
  InvalidArtifactTypeError,
} from "./artifact.errors";

export const ARTIFACT_STATUSES = ["ACTIVE", "ARCHIVED", "DELETED"] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

/**
 * §15.5. Created/Versioned/Linked are acts, not states — modelling them as
 * statuses would forbid versioning something already linked. Deletion is
 * logical and only reachable through ARCHIVED: nothing vanishes silently
 * (§5.12 — an artifact is never removed without audit).
 */
const STATUS_MACHINE = new StateMachine<ArtifactStatus>({
  ACTIVE: ["ARCHIVED"],
  ARCHIVED: ["ACTIVE", "DELETED"],
  DELETED: [],
});

/** Row shape used by persistence — actors flattened. */
export interface StoredArtifactVersion {
  version: number;
  checksum: string;
  storageRef: string;
  sizeBytes: number | null;
  createdByType: string;
  createdById: string;
  createdAt: Date;
  note: string | null;
}

interface ArtifactProps {
  workspaceId: string;
  goalId: string | null;
  taskId: string | null;
  repositoryId: string | null;
  type: string;
  name: string;
  description: string | null;
  status: ArtifactStatus;
  versions: StoredArtifactVersion[];
  tags: string[];
  metadata: Record<string, unknown>;
  immutable: boolean;
  createdBy: ActorRef;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateArtifactProps {
  workspaceId: string;
  goalId?: string;
  taskId?: string;
  repositoryId?: string;
  type: string;
  name: string;
  description?: string;
  firstVersion: NewArtifactVersion;
  tags?: readonly string[];
  metadata?: Record<string, unknown>;
  immutable?: boolean;
  createdBy: ActorRef;
  now: Date;
}

export interface UpdateArtifactMetadataProps {
  name?: string;
  description?: string;
  tags?: readonly string[];
  metadata?: Record<string, unknown>;
}

export interface ArtifactLinks {
  goalId?: string;
  taskId?: string;
  repositoryId?: string;
}

export interface ArtifactUnlinks {
  goal?: boolean;
  task?: boolean;
  repository?: boolean;
}

export type CreateArtifactError = GuardViolation | InvalidArtifactTypeError;

function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

export class Artifact extends AggregateRoot<ArtifactProps> {
  static create(
    input: CreateArtifactProps,
    id?: UniqueEntityId,
  ): Result<Artifact, CreateArtifactError> {
    const name = Guard.againstEmpty(input.name, "name");
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    // An artifact without content is not a trace: the first version is required.
    const checksum = Guard.againstEmpty(input.firstVersion.checksum, "checksum");
    const storageRef = Guard.againstEmpty(input.firstVersion.storageRef, "storageRef");
    const guards = Result.combine([name, workspaceId, checksum, storageRef]);
    if (guards.isFailure) {
      return Result.fail(guards.error);
    }
    if (!isValidArtifactType(input.type)) {
      return Result.fail(new InvalidArtifactTypeError(input.type));
    }

    const artifact = new Artifact(
      {
        workspaceId: workspaceId.value,
        goalId: input.goalId ?? null,
        taskId: input.taskId ?? null,
        repositoryId: input.repositoryId ?? null,
        type: input.type,
        name: name.value,
        description: input.description?.trim() || null,
        status: "ACTIVE",
        versions: [
          {
            version: 1,
            checksum: checksum.value,
            storageRef: storageRef.value,
            sizeBytes: input.firstVersion.sizeBytes ?? null,
            createdByType: input.createdBy.type,
            createdById: input.createdBy.actorId,
            createdAt: input.now,
            note: input.firstVersion.note?.trim() || null,
          },
        ],
        tags: normalizeTags(input.tags ?? []),
        metadata: { ...input.metadata },
        immutable: input.immutable ?? false,
        createdBy: input.createdBy,
        createdAt: input.now,
        updatedAt: input.now,
      },
      id,
    );
    artifact.addDomainEvent(
      new ArtifactCreated(artifact.id.value, input.now, workspaceId.value, input.type),
    );
    return Result.ok(artifact);
  }

  /** Rebuild from persistence — never raises events. */
  static reconstitute(props: ArtifactProps, id: string): Artifact {
    return new Artifact(props, new UniqueEntityId(id));
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get goalId(): string | null {
    return this.props.goalId;
  }

  get taskId(): string | null {
    return this.props.taskId;
  }

  get repositoryId(): string | null {
    return this.props.repositoryId;
  }

  get type(): string {
    return this.props.type;
  }

  get name(): string {
    return this.props.name;
  }

  get description(): string | null {
    return this.props.description;
  }

  get status(): ArtifactStatus {
    return this.props.status;
  }

  get versions(): readonly ArtifactVersion[] {
    return this.props.versions.map((stored) => ({
      version: stored.version,
      checksum: stored.checksum,
      storageRef: stored.storageRef,
      sizeBytes: stored.sizeBytes,
      createdBy: ActorRef.create(stored.createdByType as ActorType, stored.createdById)
        .value,
      createdAt: stored.createdAt,
      note: stored.note,
    }));
  }

  get storedVersions(): readonly StoredArtifactVersion[] {
    return [...this.props.versions];
  }

  get currentVersion(): number {
    return this.props.versions.length;
  }

  get latestVersion(): ArtifactVersion | undefined {
    return this.versions[this.versions.length - 1];
  }

  get tags(): readonly string[] {
    return [...this.props.tags];
  }

  get metadata(): Record<string, unknown> {
    return { ...this.props.metadata };
  }

  get immutable(): boolean {
    return this.props.immutable;
  }

  get createdBy(): ActorRef {
    return this.props.createdBy;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** §15.2 — appends, never replaces: earlier versions stay readable. */
  addVersion(
    version: NewArtifactVersion,
    createdBy: ActorRef,
    now: Date,
  ): Result<number, GuardViolation | ImmutableArtifactError | ArtifactNotActiveError> {
    const mutable = this.assertMutableContent();
    if (mutable.isFailure) {
      return Result.fail(mutable.error);
    }
    const checksum = Guard.againstEmpty(version.checksum, "checksum");
    const storageRef = Guard.againstEmpty(version.storageRef, "storageRef");
    const guards = Result.combine([checksum, storageRef]);
    if (guards.isFailure) {
      return Result.fail(guards.error);
    }

    const next = this.props.versions.length + 1;
    this.props.versions.push({
      version: next,
      checksum: checksum.value,
      storageRef: storageRef.value,
      sizeBytes: version.sizeBytes ?? null,
      createdByType: createdBy.type,
      createdById: createdBy.actorId,
      createdAt: now,
      note: version.note?.trim() || null,
    });
    this.props.updatedAt = now;
    this.addDomainEvent(
      new ArtifactVersioned(this.id.value, now, next, checksum.value),
    );
    return Result.ok(next);
  }

  updateMetadata(
    patch: UpdateArtifactMetadataProps,
    now: Date,
  ): Result<void, GuardViolation | ImmutableArtifactError | ArtifactNotActiveError> {
    const mutable = this.assertMutableContent();
    if (mutable.isFailure) {
      return Result.fail(mutable.error);
    }
    let nextName = this.props.name;
    if (patch.name !== undefined) {
      const name = Guard.againstEmpty(patch.name, "name");
      if (name.isFailure) {
        return Result.fail(name.error);
      }
      nextName = name.value;
    }

    this.props.name = nextName;
    if (patch.description !== undefined) {
      this.props.description = patch.description.trim() || null;
    }
    if (patch.tags !== undefined) {
      this.props.tags = normalizeTags(patch.tags);
    }
    if (patch.metadata !== undefined) {
      this.props.metadata = { ...this.props.metadata, ...patch.metadata };
    }
    this.props.updatedAt = now;
    this.addDomainEvent(new ArtifactUpdated(this.id.value, now));
    return Result.ok(undefined);
  }

  /**
   * §15.3. Allowed on an immutable artifact: immutability protects content,
   * not the way the rest of the system refers to it.
   */
  link(links: ArtifactLinks, now: Date): Result<void, ArtifactNotActiveError> {
    if (this.props.status === "DELETED") {
      return Result.fail(new ArtifactNotActiveError(this.props.status));
    }
    let changed = false;
    for (const [key, value] of [
      ["goalId", links.goalId],
      ["taskId", links.taskId],
      ["repositoryId", links.repositoryId],
    ] as const) {
      if (value !== undefined && this.props[key] !== value) {
        this.props[key] = value;
        changed = true;
      }
    }
    if (!changed) {
      return Result.ok(undefined);
    }

    this.props.updatedAt = now;
    this.addDomainEvent(new ArtifactLinked(this.id.value, now));
    return Result.ok(undefined);
  }

  unlink(targets: ArtifactUnlinks, now: Date): Result<void, ArtifactNotActiveError> {
    if (this.props.status === "DELETED") {
      return Result.fail(new ArtifactNotActiveError(this.props.status));
    }
    let changed = false;
    for (const [key, requested] of [
      ["goalId", targets.goal],
      ["taskId", targets.task],
      ["repositoryId", targets.repository],
    ] as const) {
      if (requested && this.props[key] !== null) {
        this.props[key] = null;
        changed = true;
      }
    }
    if (!changed) {
      return Result.ok(undefined);
    }

    this.props.updatedAt = now;
    this.addDomainEvent(new ArtifactUnlinked(this.id.value, now));
    return Result.ok(undefined);
  }

  /** §22.6 semantics. Archiving stays available even when immutable. */
  changeStatus(
    next: ArtifactStatus,
    now: Date,
  ): Result<void, InvalidStateTransitionError> {
    const outcome = STATUS_MACHINE.transition(this.props.status, next);
    switch (outcome.kind) {
      case "alreadyInState":
        return Result.ok(undefined);
      case "invalidTransition":
        return Result.fail(new InvalidStateTransitionError("Artifact", outcome));
      case "transitioned": {
        const from = this.props.status;
        this.props.status = outcome.to;
        this.props.updatedAt = now;
        this.addDomainEvent(
          new ArtifactStatusChanged(
            this.id.value,
            now,
            this.props.workspaceId,
            from,
            outcome.to,
          ),
        );
        return Result.ok(undefined);
      }
    }
  }

  allowedStatusTargets(): readonly ArtifactStatus[] {
    return STATUS_MACHINE.allowedFrom(this.props.status);
  }

  private assertMutableContent(): Result<
    void,
    ImmutableArtifactError | ArtifactNotActiveError
  > {
    if (this.props.immutable) {
      return Result.fail(new ImmutableArtifactError());
    }
    if (this.props.status !== "ACTIVE") {
      return Result.fail(new ArtifactNotActiveError(this.props.status));
    }
    return Result.ok(undefined);
  }
}
