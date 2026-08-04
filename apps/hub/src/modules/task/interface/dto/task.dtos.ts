import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

import { PRIORITIES, Priority } from "../../../../kernel/domain/priority";
import { ACTOR_TYPES, ActorType } from "../../../identity/domain/actor";
import { BLOCKER_TYPES, BlockerType } from "../../domain/blocker";
import { TASK_STATUSES, TaskStatus } from "../../domain/task";

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  goalId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  acceptanceCriteria!: string[];

  /** Mandatory: a task is assigned from its first instant (§4.6). */
  @IsIn(ACTOR_TYPES)
  assigneeType!: ActorType;

  @IsString()
  @IsNotEmpty()
  assigneeId!: string;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  repositoryId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedDurationMinutes?: number;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  acceptanceCriteria?: string[];

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;

  @IsOptional()
  @IsString()
  repositoryId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedDurationMinutes?: number;
}

export class AssignTaskDto {
  @IsIn(ACTOR_TYPES)
  assigneeType!: ActorType;

  @IsString()
  @IsNotEmpty()
  assigneeId!: string;
}

export class ChangeTaskStatusDto {
  @IsIn(TASK_STATUSES)
  status!: TaskStatus;
}

export class ReportBlockerDto {
  @IsIn(BLOCKER_TYPES)
  type!: BlockerType;

  @IsString()
  @IsNotEmpty()
  description!: string;
}

export class ResolveBlockerDto {
  @IsString()
  @IsNotEmpty()
  resolution!: string;
}

export class ManageTaskDependencyDto {
  @IsString()
  @IsNotEmpty()
  dependsOnTaskId!: string;
}

export class SubmitTaskDto {
  /**
   * The kinds of proof expected (§11.2 — an open list). Naming none is
   * legitimate: a human will simply approve, and inventing a default here
   * would be a policy (§12) nobody asked for.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  validations?: string[];
}
