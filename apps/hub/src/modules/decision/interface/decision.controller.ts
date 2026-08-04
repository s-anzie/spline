import {
  Body,
  Controller,
  Get,
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
import { GetDecisionUseCase } from "../application/get-decision.use-case";
import { ListDecisionsUseCase } from "../application/list-decisions.use-case";
import { RecordDecisionUseCase } from "../application/record-decision.use-case";
import { SupersedeDecisionUseCase } from "../application/supersede-decision.use-case";
import { Decision } from "../domain/decision";
import { ListDecisionsQueryDto, RecordDecisionDto } from "./dto/decision.dtos";

interface DecisionView {
  id: string;
  workspaceId: string;
  taskId: string | null;
  subject: string;
  rationale: string;
  alternatives: { option: string; rejectedBecause: string }[];
  outcome: string;
  confidence: string;
  author: { type: string; id: string };
  supersededByDecisionId: string | null;
  isSuperseded: boolean;
  decidedAt: string;
}

function toView(decision: Decision): DecisionView {
  return {
    id: decision.id.value,
    workspaceId: decision.workspaceId,
    taskId: decision.taskId,
    subject: decision.subject,
    rationale: decision.rationale,
    alternatives: decision.alternatives.map((alternative) => ({ ...alternative })),
    outcome: decision.outcome,
    confidence: decision.confidence,
    author: { type: decision.author.type, id: decision.author.actorId },
    supersededByDecisionId: decision.supersededByDecisionId,
    isSuperseded: decision.isSuperseded,
    decidedAt: decision.decidedAt.toISOString(),
  };
}

@Controller("workspaces/:workspaceId/decisions")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class DecisionController {
  constructor(
    private readonly recordDecision: RecordDecisionUseCase,
    private readonly supersedeDecision: SupersedeDecisionUseCase,
    private readonly getDecision: GetDecisionUseCase,
    private readonly listDecisions: ListDecisionsUseCase,
  ) {}

  /**
   * Open to every role that holds record_decisions — including READ_ONLY_AGENT:
   * writing down a rationale changes no state, and it is the most legitimate
   * contribution a read-only agent can make.
   */
  @Post()
  @RequirePermission("record_decisions")
  async record(
    @Param("workspaceId") workspaceId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: RecordDecisionDto,
  ): Promise<{ decisionId: string }> {
    const result = await this.recordDecision.execute({
      workspaceId,
      ...dto,
      authorType: actor.actorType,
      authorId: actor.actorId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
  }

  /** Replacing a decision is still recording reasoning, hence the same permission. */
  @Post(":decisionId/supersede")
  @RequirePermission("record_decisions")
  async supersede(
    @Param("workspaceId") workspaceId: string,
    @Param("decisionId") decisionId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: RecordDecisionDto,
  ): Promise<{ decisionId: string }> {
    const result = await this.supersedeDecision.execute({
      decisionId,
      workspaceId,
      ...dto,
      authorType: actor.actorType,
      authorId: actor.actorId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        conflicts: ["DecisionAlreadySupersededError", "DecisionSupersessionError"],
      });
    }
    return result.value;
  }

  @Get()
  @RequirePermission("read_workspace_state")
  async list(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListDecisionsQueryDto,
  ): Promise<DecisionView[]> {
    const result = await this.listDecisions.execute({
      workspaceId,
      ...(query.taskId !== undefined && { taskId: query.taskId }),
      ...(query.confidence !== undefined && { confidences: [query.confidence] }),
      ...(query.includeSuperseded !== undefined && {
        includeSuperseded: query.includeSuperseded,
      }),
    });
    return result.value.map(toView);
  }

  @Get(":decisionId")
  @RequirePermission("read_workspace_state")
  async get(
    @Param("workspaceId") workspaceId: string,
    @Param("decisionId") decisionId: string,
  ): Promise<DecisionView> {
    const result = await this.getDecision.execute({ decisionId, workspaceId });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return toView(result.value);
  }
}
