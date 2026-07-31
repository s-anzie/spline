import { IsIn } from "class-validator";

import { ArtifactLinkTargetType } from "../../domain/artifact";

const TARGET_TYPES: ArtifactLinkTargetType[] = ["goal", "task", "decision", "process"];

export class UnlinkArtifactDto {
  @IsIn(TARGET_TYPES)
  targetType!: ArtifactLinkTargetType;
}
