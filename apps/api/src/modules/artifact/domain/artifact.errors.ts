import { DomainError } from "../../../kernel/domain/domain-error";

export class EmptyArtifactNameError extends DomainError {
  constructor() {
    super("EMPTY_ARTIFACT_NAME", "Artifact name cannot be empty");
  }
}

export class ArtifactArchivedError extends DomainError {
  constructor(artifactId: string) {
    super("ARTIFACT_ARCHIVED", `Artifact "${artifactId}" is archived and cannot be modified`);
  }
}
