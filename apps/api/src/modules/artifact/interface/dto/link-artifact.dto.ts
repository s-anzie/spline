import { IsIn, IsNotEmpty, IsString } from "class-validator";

import { ArtifactLinkTargetType } from "../../domain/artifact";

const TARGET_TYPES: ArtifactLinkTargetType[] = ["goal", "task", "decision", "process"];

export class LinkArtifactDto {
  @IsIn(TARGET_TYPES)
  targetType!: ArtifactLinkTargetType;

  @IsString()
  @IsNotEmpty()
  targetId!: string;
}
