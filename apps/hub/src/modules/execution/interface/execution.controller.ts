import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import {
  BeginAttemptUseCase,
  CheckResumableUseCase,
  FinishAttemptUseCase,
  RetryTaskUseCase,
  StartRunUseCase,
  SweepOverrunRunsUseCase,
} from "../application/run.use-cases";
import { ATTEMPT_OUTCOMES, AttemptOutcome, Run } from "../domain/run";
import { RUN_REPOSITORY, RunRepository } from "../domain/ports/run.repository.port";

export class ListRunsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taskId?: string;
}

export class StartRunDto {
  @IsString()
  @IsNotEmpty()
  taskId!: string;
}

export class BeginAttemptDto {
  @IsString()
  @IsNotEmpty()
  workerId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  provider!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  promptVersion?: string;
}

export class FinishAttemptDto {
  @IsIn(ATTEMPT_OUTCOMES)
  outcome!: AttemptOutcome;

  @IsOptional()
  @IsObject()
  tokenUsage?: Record<string, number>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsIn(["VALIDATING", "FAILED"])
  runStatus?: "VALIDATING" | "FAILED";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  failureReason?: string;
}

export class SweepDto {
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  ttlMs!: number;
}

function toRunView(run: Run) {
  return {
    runId: run.id.value,
    taskId: run.taskId,
    attemptNumber: run.attemptNumber,
    workerId: run.workerId,
    status: run.status,
    failureReason: run.failureReason,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    attempts: run.attempts.map((attempt) => ({
      number: attempt.number,
      provider: attempt.provider,
      model: attempt.model,
      promptVersion: attempt.promptVersion,
      /** §4.8 — what a resume would resume. Rendered so a client can offer it. */
      providerSessionId: attempt.providerSessionId,
      tokenUsage: attempt.tokenUsage,
      cost: attempt.cost,
      durationMs: attempt.durationMs,
      outcome: attempt.outcome,
      // §17 — what the agent said and which tools it reached for.
      trace: attempt.trace ?? [],
    })),
    // §20.6 — the affordances, so a client offers what will work.
    allowedStatusTargets: run.allowedStatusTargets(),
  };
}

/**
 * §4.7, §9.12-9.13 — the execution history of a workspace's tasks.
 *
 * Guarded by `execute_tasks` for the writes: recording what ran is part of
 * running it, and the actors that execute are the ones that report. Reading
 * is `read_workspace_state` like every other history here.
 */
@Controller("workspaces/:workspaceId/runs")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class ExecutionController {
  constructor(
    private readonly startRun: StartRunUseCase,
    private readonly retryTask: RetryTaskUseCase,
    private readonly beginAttempt: BeginAttemptUseCase,
    private readonly finishAttempt: FinishAttemptUseCase,
    private readonly checkResumable: CheckResumableUseCase,
    private readonly sweep: SweepOverrunRunsUseCase,
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
  ) {}

  @Post()
  @RequirePermission("execute_tasks")
  async start(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: StartRunDto,
  ): Promise<{ runId: string }> {
    const result = await this.startRun.execute({ workspaceId, taskId: dto.taskId });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
  }

  /**
   * §9.12 — "Chaque Retry crée un nouveau Run et une nouvelle Attempt."
   * Declared before the parametric routes below, because a parametric sibling
   * declared first would swallow it (the shadowing invariant exists for this).
   */
  @Post("retry")
  @RequirePermission("execute_tasks")
  async retry(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: StartRunDto,
  ): Promise<{ runId: string }> {
    const result = await this.retryTask.execute({ workspaceId, taskId: dto.taskId });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        conflicts: ["TaskNotRetryableError"],
      });
    }
    return result.value;
  }

  /** §9.13 — fails what has been executing longer than this workspace allows. */
  @Post("sweep-overrun")
  @HttpCode(200)
  @RequirePermission("manage_machines")
  async sweepOverrun(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: SweepDto,
  ): Promise<{ failed: string[] }> {
    const result = await this.sweep.execute({ workspaceId, ttlMs: dto.ttlMs });
    return result.value;
  }

  @Get()
  @RequirePermission("read_workspace_state")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListRunsQueryDto,
  ) {
    return (
      await this.runs.list({ workspaceId, taskId: query.taskId, limit: query.limit })
    ).map(toRunView);
  }

  @Get(":runId")
  @RequirePermission("read_workspace_state")
  async get(
    @Param("workspaceId") workspaceId: string,
    @Param("runId") runId: string,
  ) {
    const run = await this.runs.findById(runId);
    if (!run || run.workspaceId !== workspaceId) {
      throw toHttpException({ name: "RunNotFoundError", message: `Run "${runId}" was not found` });
    }
    return toRunView(run);
  }

  /**
   * §4.8 (0.3.11) — asked BEFORE a session is started, so a mismatched
   * provider is refused where the decision is, not where the context breaks.
   */
  @Get(":runId/resumable/:provider")
  @RequirePermission("read_workspace_state")
  async resumable(
    @Param("workspaceId") workspaceId: string,
    @Param("runId") runId: string,
    @Param("provider") provider: string,
  ): Promise<{ provider: string }> {
    const result = await this.checkResumable.execute({ runId, workspaceId, provider });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        conflicts: ["AttemptNotResumableError"],
      });
    }
    return result.value;
  }

  @Post(":runId/attempts")
  @RequirePermission("execute_tasks")
  async begin(
    @Param("workspaceId") workspaceId: string,
    @Param("runId") runId: string,
    @Body() dto: BeginAttemptDto,
  ): Promise<{ attemptNumber: number }> {
    const result = await this.beginAttempt.execute({ runId, workspaceId, ...dto });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        conflicts: ["AttemptAlreadyInFlightError"],
      });
    }
    return result.value;
  }

  @Post(":runId/attempts/finish")
  @HttpCode(200)
  @RequirePermission("execute_tasks")
  async finish(
    @Param("workspaceId") workspaceId: string,
    @Param("runId") runId: string,
    @Body() dto: FinishAttemptDto,
  ): Promise<{ ok: true }> {
    const result = await this.finishAttempt.execute({ runId, workspaceId, ...dto });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        conflicts: ["NoAttemptInFlightError"],
      });
    }
    return { ok: true };
  }
}
