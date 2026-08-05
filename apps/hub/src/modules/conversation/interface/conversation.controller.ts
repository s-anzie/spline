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
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { ActorIdentity } from "../../identity/application/permissions.service";
import { ACTOR_TYPES, ActorRef, ActorType } from "../../identity/domain/actor";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import {
  DeliverOutcomeUseCase,
  OpenThreadUseCase,
  SpeakInThreadUseCase,
} from "../application/thread.use-cases";
import {
  THREAD_REPOSITORY,
  ThreadRepository,
} from "../domain/ports/thread.repository.port";
import { MAX_TURN_BUDGET, THREAD_STATUSES, Thread, ThreadStatus } from "../domain/thread";

export class OpenThreadDto {
  @IsIn(ACTOR_TYPES)
  participantType!: ActorType;

  @IsString()
  @IsNotEmpty()
  participantId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  subject!: string;

  /** §10.18a — set to delegate work and wait for its answer. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taskId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TURN_BUDGET)
  turnBudget?: number;
}

export class SpeakDto {
  /**
   * §10.18b — absent means "I have nothing to add", which closes the thread.
   * Optional on purpose: making it required would remove the only polite way
   * to stop, and a conversation would end only by running out.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message?: string;
}

export class DeliverDto {
  @IsObject()
  outcome!: Record<string, unknown>;
}

export class ListThreadsQueryDto {
  @IsOptional()
  @IsIn(THREAD_STATUSES)
  status?: ThreadStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

function toThreadView(thread: Thread) {
  return {
    threadId: thread.id.value,
    subject: thread.subject,
    initiator: { type: thread.initiator.type, id: thread.initiator.actorId },
    participant: { type: thread.participant.type, id: thread.participant.actorId },
    taskId: thread.taskId,
    status: thread.status,
    /** §10.18b — how much is left, so a caller can decide before spending it. */
    turnBudget: thread.turnBudget,
    turnsLeft: thread.turnsLeft,
    awaiting: thread.isAwaiting,
    outcome: thread.outcome,
    turns: thread.turns.map((turn) => ({
      actor: { type: turn.actor.type, id: turn.actor.actorId },
      message: turn.message,
      at: turn.at.toISOString(),
    })),
    /** §20.6 — what can still happen to it. */
    allowedStatusTargets: thread.allowedStatusTargets(),
  };
}

/**
 * §10.18a-b — bounded exchanges between two actors.
 *
 * `contribute_knowledge` throughout: speaking to a colleague is the same
 * category of act as noting what one learned or recording a decision. It is
 * withheld from VIEWER, the only role that observes without participating.
 */
@Controller("workspaces/:workspaceId/threads")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class ConversationController {
  constructor(
    private readonly openThread: OpenThreadUseCase,
    private readonly speak: SpeakInThreadUseCase,
    private readonly deliver: DeliverOutcomeUseCase,
    @Inject(THREAD_REPOSITORY) private readonly threads: ThreadRepository,
  ) {}

  @Post()
  @RequirePermission("contribute_knowledge")
  async open(
    @Param("workspaceId") workspaceId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: OpenThreadDto,
  ): Promise<{ threadId: string }> {
    const result = await this.openThread.execute({
      workspaceId,
      initiator: asActorRef(actor),
      ...dto,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
  }

  /** Threads this caller is one of the two sides of — never everyone's. */
  @Get("mine")
  @RequirePermission("read_workspace_state")
  async mine(
    @Param("workspaceId") workspaceId: string,
    @CurrentActor() actor: ActorIdentity,
    @Query() query: ListThreadsQueryDto,
  ) {
    const threads = await this.threads.list({
      workspaceId,
      participant: asActorRef(actor),
      status: query.status,
      limit: query.limit,
    });
    return threads.map(toThreadView);
  }

  @Get(":threadId")
  @RequirePermission("read_workspace_state")
  async get(
    @Param("workspaceId") workspaceId: string,
    @Param("threadId") threadId: string,
  ) {
    const thread = await this.threads.findById(threadId);
    if (!thread || thread.workspaceId !== workspaceId) {
      throw toHttpException({
        name: "ThreadNotFoundError",
        message: `Thread "${threadId}" was not found`,
      });
    }
    return toThreadView(thread);
  }

  /**
   * One turn, or the token that ends the exchange. Both on one route because
   * they are the same decision from a speaker's side — two routes would let a
   * client implement only the first, which is how a conversation loses its
   * ability to stop (§10.18b).
   */
  @Post(":threadId/turns")
  @HttpCode(200)
  @RequirePermission("contribute_knowledge")
  async turn(
    @Param("workspaceId") workspaceId: string,
    @Param("threadId") threadId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: SpeakDto,
  ) {
    const result = await this.speak.execute({
      workspaceId,
      threadId,
      actor: asActorRef(actor),
      message: dto.message,
    });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        forbidden: ["NotAParticipantError"],
        conflicts: ["ThreadClosedError", "TurnBudgetExhaustedError"],
      });
    }
    return result.value;
  }

  /** §10.18a — the answer to a delegation, sent back by hand. */
  @Post(":threadId/outcome")
  @HttpCode(200)
  @RequirePermission("contribute_knowledge")
  async outcome(
    @Param("workspaceId") workspaceId: string,
    @Param("threadId") threadId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: DeliverDto,
  ): Promise<{ ok: true }> {
    const result = await this.deliver.execute({
      workspaceId,
      threadId,
      actor: asActorRef(actor),
      outcome: dto.outcome,
    });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        forbidden: ["NotAParticipantError"],
        conflicts: ["ThreadClosedError"],
      });
    }
    return { ok: true };
  }
}

function asActorRef(actor: ActorIdentity): ActorRef {
  // The guard resolved this identity, so it cannot be invalid by the time a
  // route runs.
  return ActorRef.create(actor.actorType, actor.actorId).value;
}
