import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class RecordDecisionDto {
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsOptional()
  @IsString()
  context?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  optionsConsidered?: string[];

  @IsString()
  @IsNotEmpty()
  decision!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  references?: string[];
}
