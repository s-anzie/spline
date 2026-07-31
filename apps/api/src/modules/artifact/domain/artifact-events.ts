import { DomainEvent } from "../../../kernel/domain/domain-event";
import { ArtifactLinkTargetType } from "./artifact";

export class ArtifactCreated extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly artifactId: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "artifact.created";
  }
}

export class ArtifactUpdated extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly artifactId: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "artifact.updated";
  }
}

export class ArtifactVersioned extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly artifactId: string,
    public readonly version: number,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "artifact.versioned";
  }
}

export class ArtifactLinked extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly artifactId: string,
    public readonly targetType: ArtifactLinkTargetType,
    public readonly targetId: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "artifact.linked";
  }
}

export class ArtifactUnlinked extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly artifactId: string,
    public readonly targetType: ArtifactLinkTargetType,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "artifact.unlinked";
  }
}

export class ArtifactArchived extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly artifactId: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "artifact.archived";
  }
}

export class ArtifactDeleted extends DomainEvent {
  constructor(
    workspaceId: string,
    public readonly artifactId: string,
  ) {
    super(workspaceId);
  }

  get eventName(): string {
    return "artifact.deleted";
  }
}
