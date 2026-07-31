import { IsObject } from "class-validator";

export class UpdateWorkspaceRulesetDto {
  @IsObject()
  ruleset!: Record<string, unknown>;
}
