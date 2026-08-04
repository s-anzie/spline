import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { ActorIdentity } from "../../identity/application/permissions.service";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import { InvalidateValidationsUseCase } from "../application/invalidate-validations.use-case";
import {
  GetValidationUseCase,
  ListValidationsUseCase,
} from "../application/list-validations.use-case";
import { RequestValidationUseCase } from "../application/request-validation.use-case";
import { SettleValidationUseCase } from "../application/settle-validation.use-case";
import { Validation } from "../domain/validation";
import {
  InvalidateValidationsDto,
  ListValidationsQueryDto,
  RequestValidationsDto,
  SettleValidationDto,
} from "./dto/validation.dtos";

function toView(validation: Validation) {
  return {
    id: validation.id.value,
    workspaceId: validation.workspaceId,
    taskId: validation.taskId,
    type: validation.type,
    status: validation.status,
    mandatory: validation.mandatory,
    requestedBy: {
      type: validation.requestedBy.type,
      id: validation.requestedBy.actorId,
    },
    executedBy: validation.executedBy
      ? { type: validation.executedBy.type, id: validation.executedBy.actorId }
      : null,
    output: validation.output,
    reportArtifactIds: validation.reportArtifactIds,
    dependsOnValidationIds: validation.dependsOnValidationIds,
    /** Whether it currently stands as proof (§11.7) — not merely its status. */
    satisfies: validation.satisfies(),
    invalidatedAt: validation.invalidatedAt?.toISOString() ?? null,
    invalidationReason: validation.invalidationReason,
    createdAt: validation.createdAt.toISOString(),
    startedAt: validation.startedAt?.toISOString() ?? null,
    finishedAt: validation.finishedAt?.toISOString() ?? null,
    /** §20.6 — the affordances, before the caller hits a refusal. */
    allowedStatusTargets: validation.allowedStatusTargets(),
  };
}

@Controller("workspaces/:workspaceId")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class ValidationController {
  constructor(
    private readonly request: RequestValidationUseCase,
    private readonly settle: SettleValidationUseCase,
    private readonly listValidations: ListValidationsUseCase,
    private readonly getValidation: GetValidationUseCase,
    private readonly invalidate: InvalidateValidationsUseCase,
  ) {}

  /** §10.9 — an agent asks for proof; asking is part of doing the work. */
  @Post("tasks/:taskId/validations")
  @RequirePermission("request_validation")
  async ask(
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: RequestValidationsDto,
  ): Promise<{ validationIds: string[] }> {
    const result = await this.request.execute({
      workspaceId,
      taskId,
      requestedByType: actor.actorType,
      requestedById: actor.actorId,
      validations: dto.validations,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
  }

  @Get("validations")
  @RequirePermission("read_workspace_state")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListValidationsQueryDto,
  ) {
    const result = await this.listValidations.execute({
      workspaceId,
      taskId: query.taskId,
      statuses: query.status ? [query.status] : undefined,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value.map(toView);
  }

  @Get("validations/:validationId")
  @RequirePermission("read_workspace_state")
  async one(
    @Param("workspaceId") workspaceId: string,
    @Param("validationId") validationId: string,
  ) {
    const result = await this.getValidation.execute({ workspaceId, validationId });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return toView(result.value);
  }

  /**
   * Recording a verdict needs approve_validation, not request_validation: an
   * agent submits, something else judges (§10.9). Letting the requester also
   * pronounce would give back exactly what the rule takes away.
   */
  @Post("validations/:validationId/settle")
  @HttpCode(200)
  @RequirePermission("approve_validation")
  async pronounce(
    @Param("workspaceId") workspaceId: string,
    @Param("validationId") validationId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: SettleValidationDto,
  ): Promise<{ ok: true }> {
    const result = await this.settle.execute({
      workspaceId,
      validationId,
      action: dto.action,
      actorType: actor.actorType,
      actorId: actor.actorId,
      output: dto.output,
      reportArtifactIds: dto.reportArtifactIds,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return { ok: true };
  }

  /** §11.8 — explicit: whoever saw the change says so. */
  @Post("tasks/:taskId/validations/invalidate")
  @HttpCode(200)
  @RequirePermission("approve_validation")
  async invalidateAll(
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Body() dto: InvalidateValidationsDto,
  ): Promise<{ invalidated: number }> {
    const result = await this.invalidate.execute({
      workspaceId,
      taskId,
      reason: dto.reason,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
  }
}
