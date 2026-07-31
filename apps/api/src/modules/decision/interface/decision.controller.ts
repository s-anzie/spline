import { BadRequestException, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, Body, UseGuards } from "@nestjs/common";

import {
  AuthenticatedRequester,
  CurrentRequester,
  JwtAuthGuard,
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface";
import { DomainError } from "../../../kernel/domain/domain-error";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { DecisionNotFoundError } from "../application/decision-application.errors";
import { GetDecisionUseCase } from "../application/get-decision.use-case";
import { ListDecisionsByWorkspaceUseCase } from "../application/list-decisions-by-workspace.use-case";
import { RecordDecisionUseCase } from "../application/record-decision.use-case";
import { Decision } from "../domain/decision";
import {
  EmptyDecisionOutcomeError,
  EmptyDecisionSubjectError,
  InvalidDecisionConfidenceError,
} from "../domain/decision.errors";
import { RecordDecisionDto } from "./dto/record-decision.dto";

function toDecisionResponse(decision: Decision) {
  return {
    id: decision.id.toString(),
    workspaceId: decision.workspaceId,
    subject: decision.subject,
    context: decision.context ?? null,
    optionsConsidered: decision.optionsConsidered,
    decision: decision.decision,
    decidedByType: decision.decidedByType,
    decidedById: decision.decidedById,
    decidedAt: decision.decidedAt.toISOString(),
    confidence: decision.confidence ?? null,
    references: decision.references,
  };
}

function toHttpError(error: DomainError): Error {
  if (error instanceof WorkspaceNotFoundError || error instanceof DecisionNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (
    error instanceof EmptyDecisionSubjectError ||
    error instanceof EmptyDecisionOutcomeError ||
    error instanceof InvalidDecisionConfidenceError
  ) {
    return new BadRequestException(error.message);
  }
  return new BadRequestException(error.message);
}

@Controller("workspaces/:workspaceId/decisions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DecisionController {
  constructor(
    private readonly recordDecisionUseCase: RecordDecisionUseCase,
    private readonly getDecisionUseCase: GetDecisionUseCase,
    private readonly listDecisionsByWorkspaceUseCase: ListDecisionsByWorkspaceUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("create_task")
  async record(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: RecordDecisionDto,
    @CurrentRequester() requester: AuthenticatedRequester,
  ) {
    const result = await this.recordDecisionUseCase.execute({
      workspaceId,
      subject: dto.subject,
      context: dto.context,
      optionsConsidered: dto.optionsConsidered,
      decision: dto.decision,
      decidedBy: { type: requester.type, id: requester.id },
      confidence: dto.confidence,
      references: dto.references,
    });
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toDecisionResponse(result.value);
  }

  @Get()
  @RequirePermission("read_tasks")
  async list(@Param("workspaceId") workspaceId: string) {
    const decisions = await this.listDecisionsByWorkspaceUseCase.execute(workspaceId);
    return decisions.map(toDecisionResponse);
  }

  @Get(":decisionId")
  @RequirePermission("read_tasks")
  async get(@Param("decisionId") decisionId: string) {
    const result = await this.getDecisionUseCase.execute(decisionId);
    if (result.isFailure) {
      throw toHttpError(result.error);
    }
    return toDecisionResponse(result.value);
  }
}
