import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
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
  /**
   * §4.6 — whether this task is ready to be worked on, or still being planned.
   *
   * Explicit rather than inferred, and false by default because creating a
   * task is not always handing it out — somebody sketching a plan means
   * PLANNED, and a hub that started everything would run their sketch.
   *
   * A manager cutting work sets it. Before this existed, every task a manager
   * cut sat at PLANNED forever: nothing dispatches a PLANNED task, so a
   * manager could read a need, state a goal, cut it into three tasks and
   * assign them all — and not one of them would ever run. The organising
   * worked and the work never started, which from outside is the same as an
   * agent that did nothing.
   */
  @IsOptional()
  @IsBoolean()
  start?: boolean;

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
