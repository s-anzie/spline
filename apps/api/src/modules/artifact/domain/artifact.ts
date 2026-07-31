import { ActorType, ArtifactStatus, ArtifactType } from "@repo/db";

import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import {
  ArtifactArchived,
  ArtifactCreated,
  ArtifactLinked,
  ArtifactUnlinked,
  ArtifactUpdated,
  ArtifactVersioned,
} from "./artifact-events";
import { ArtifactArchivedError, EmptyArtifactNameError } from "./artifact.errors";

export type ArtifactLinkTargetType = "goal" | "task" | "decision" | "process";

export interface Actor {
  type: ActorType;
  id: string;
}

export interface ArtifactVersionEntry {
  version: number;
  contentRef?: string;
  checksum?: string;
  createdAt: string;
  createdByType: ActorType;
  createdById: string;
}

export interface ArtifactProps {
  workspaceId: string;
  goalId?: string;
  taskId?: string;
  decisionId?: string;
  processId?: string;
  type: ArtifactType;
  name: string;
  description?: string;
  status: ArtifactStatus;
  version: number;
  versions: ArtifactVersionEntry[];
  source?: string;
  contentRef?: string;
  checksum?: string;
  createdByType: ActorType;
  createdById: string;
  updatedByType?: ActorType;
  updatedById?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateArtifactProps {
  workspaceId: string;
  goalId?: string;
  taskId?: string;
  decisionId?: string;
  processId?: string;
  type: ArtifactType;
  name: string;
  description?: string;
  source?: string;
  contentRef?: string;
  checksum?: string;
  createdBy: Actor;
}

export interface UpdateArtifactMetadataProps {
  name?: string;
  description?: string;
  source?: string;
}

export interface AddArtifactVersionProps {
  contentRef?: string;
  checksum?: string;
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new EmptyArtifactNameError();
  }
  return trimmed;
}

function linkFieldFor(targetType: ArtifactLinkTargetType): keyof ArtifactProps {
  switch (targetType) {
    case "goal":
      return "goalId";
    case "task":
      return "taskId";
    case "decision":
      return "decisionId";
    case "process":
      return "processId";
  }
}

export class Artifact extends AggregateRoot<ArtifactProps> {
  static create(props: CreateArtifactProps, id?: UniqueEntityId): Artifact {
    const now = new Date();
    const artifact = new Artifact(
      {
        workspaceId: props.workspaceId,
        goalId: props.goalId,
        taskId: props.taskId,
        decisionId: props.decisionId,
        processId: props.processId,
        type: props.type,
        name: normalizeName(props.name),
        description: props.description,
        status: ArtifactStatus.ACTIVE,
        version: 1,
        versions: [
          {
            version: 1,
            contentRef: props.contentRef,
            checksum: props.checksum,
            createdAt: now.toISOString(),
            createdByType: props.createdBy.type,
            createdById: props.createdBy.id,
          },
        ],
        source: props.source,
        contentRef: props.contentRef,
        checksum: props.checksum,
        createdByType: props.createdBy.type,
        createdById: props.createdBy.id,
        createdAt: now,
        updatedAt: now,
      },
      id,
    );
    artifact.record(new ArtifactCreated(artifact.props.workspaceId, artifact.id.toString()));
    return artifact;
  }

  static reconstitute(props: ArtifactProps, id: UniqueEntityId): Artifact {
    return new Artifact(props, id);
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get goalId(): string | undefined {
    return this.props.goalId;
  }

  get taskId(): string | undefined {
    return this.props.taskId;
  }

  get decisionId(): string | undefined {
    return this.props.decisionId;
  }

  get processId(): string | undefined {
    return this.props.processId;
  }

  get type(): ArtifactType {
    return this.props.type;
  }

  get name(): string {
    return this.props.name;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get status(): ArtifactStatus {
    return this.props.status;
  }

  get version(): number {
    return this.props.version;
  }

  get versions(): readonly ArtifactVersionEntry[] {
    return this.props.versions;
  }

  get source(): string | undefined {
    return this.props.source;
  }

  get contentRef(): string | undefined {
    return this.props.contentRef;
  }

  get checksum(): string | undefined {
    return this.props.checksum;
  }

  get createdByType(): ActorType {
    return this.props.createdByType;
  }

  get createdById(): string {
    return this.props.createdById;
  }

  get updatedByType(): ActorType | undefined {
    return this.props.updatedByType;
  }

  get updatedById(): string | undefined {
    return this.props.updatedById;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get isArchived(): boolean {
    return this.props.status === ArtifactStatus.ARCHIVED;
  }

  private ensureNotArchived(): void {
    if (this.isArchived) {
      throw new ArtifactArchivedError(this.id.toString());
    }
  }

  private touch(updatedBy: Actor): void {
    this.props.updatedByType = updatedBy.type;
    this.props.updatedById = updatedBy.id;
    this.props.updatedAt = new Date();
  }

  updateMetadata(props: UpdateArtifactMetadataProps, updatedBy: Actor): void {
    this.ensureNotArchived();
    if (props.name !== undefined) {
      this.props.name = normalizeName(props.name);
    }
    if (props.description !== undefined) {
      this.props.description = props.description;
    }
    if (props.source !== undefined) {
      this.props.source = props.source;
    }
    this.touch(updatedBy);
    this.record(new ArtifactUpdated(this.props.workspaceId, this.id.toString()));
  }

  addVersion(props: AddArtifactVersionProps, updatedBy: Actor): void {
    this.ensureNotArchived();
    const nextVersion = this.props.version + 1;
    this.props.version = nextVersion;
    this.props.contentRef = props.contentRef;
    this.props.checksum = props.checksum;
    this.props.versions = [
      ...this.props.versions,
      {
        version: nextVersion,
        contentRef: props.contentRef,
        checksum: props.checksum,
        createdAt: new Date().toISOString(),
        createdByType: updatedBy.type,
        createdById: updatedBy.id,
      },
    ];
    this.touch(updatedBy);
    this.record(new ArtifactVersioned(this.props.workspaceId, this.id.toString(), nextVersion));
  }

  linkTo(targetType: ArtifactLinkTargetType, targetId: string, updatedBy: Actor): void {
    this.ensureNotArchived();
    (this.props[linkFieldFor(targetType)] as string | undefined) = targetId;
    this.touch(updatedBy);
    this.record(new ArtifactLinked(this.props.workspaceId, this.id.toString(), targetType, targetId));
  }

  unlinkFrom(targetType: ArtifactLinkTargetType, updatedBy: Actor): void {
    this.ensureNotArchived();
    (this.props[linkFieldFor(targetType)] as string | undefined) = undefined;
    this.touch(updatedBy);
    this.record(new ArtifactUnlinked(this.props.workspaceId, this.id.toString(), targetType));
  }

  archive(updatedBy: Actor): void {
    this.ensureNotArchived();
    this.props.status = ArtifactStatus.ARCHIVED;
    this.touch(updatedBy);
    this.record(new ArtifactArchived(this.props.workspaceId, this.id.toString()));
  }
}
