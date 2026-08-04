import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";

import {
  POLICY_SCOPES,
  POLICY_TYPES,
  PolicyScopeType,
  PolicyType,
} from "../../domain/policy";

export class SetPolicyDto {
  @IsIn(POLICY_SCOPES)
  scopeType!: PolicyScopeType;

  @IsString()
  @IsNotEmpty()
  scopeId!: string;

  @IsIn(POLICY_TYPES)
  type!: PolicyType;

  /** Free string: §12.3 lists examples, not a closed set. */
  @IsString()
  @IsNotEmpty()
  rule!: string;

  /**
   * Declarative, so deliberately untyped: §12.3 rules carry numbers, strings,
   * lists and objects, and whoever enforces the rule interprets it. Still
   * decorated, because `forbidNonWhitelisted` rejects any property that
   * carries no validator at all — "anything" has to be said out loud.
   */
  @IsDefined()
  value!: unknown;
}

export class ListPoliciesQueryDto {
  @IsOptional()
  @IsIn(POLICY_TYPES)
  type?: PolicyType;

  @IsOptional()
  @IsIn(POLICY_SCOPES)
  scopeType?: PolicyScopeType;

  /** A query string is text: "true" has to be turned into a boolean, and
   * Type(() => Boolean) would make "false" true. */
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  includeDisabled?: boolean;
}

export class ResolvePoliciesQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  organizationId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  repositoryId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  goalId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taskId?: string;
}
