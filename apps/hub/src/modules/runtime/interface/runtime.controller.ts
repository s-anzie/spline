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
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { toHttpException } from "../../../kernel/interface/domain-error.mapping";
import { ActorIdentity } from "../../identity/application/permissions.service";
import { ACTOR_TYPES, ActorType } from "../../identity/domain/actor";
import { ActorAuthGuard } from "../../identity/interface/actor-auth.guard";
import { CurrentActor } from "../../identity/interface/current-actor.decorator";
import {
  PermissionsGuard,
  RequirePermission,
} from "../../identity/interface/permissions.guard";
import {
  AdvanceSessionUseCase,
  AttachWorkerUseCase,
  RegisterWorkerUseCase,
  SetProviderAvailabilityUseCase,
  StartSessionUseCase,
  WorkerHeartbeatUseCase,
} from "../application/runtime.use-cases";
import { AgentSession, SESSION_STATUSES, SessionStatus } from "../domain/agent-session";
import { ProviderProfile } from "../domain/provider-profile";
import {
  PROVIDER_STORE,
  ProviderStore,
  SESSION_STORE,
  SessionStore,
  WORKER_STORE,
  WorkerStore,
} from "../domain/ports/runtime.repository.port";
import { WORKER_STATUSES, WorkerNode, WorkerStatus } from "../domain/worker-node";

export class RegisterWorkerDto {
  @IsString()
  @IsNotEmpty()
  hostname!: string;

  @IsString()
  @IsNotEmpty()
  architecture!: string;

  @IsString()
  @IsNotEmpty()
  operatingSystem!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];
}

export class HeartbeatDto {
  @IsOptional()
  @IsIn(WORKER_STATUSES)
  status?: WorkerStatus;
}

export class AttachWorkerDto {
  @IsString()
  @IsNotEmpty()
  workerId!: string;
}

export class StartSessionDto {
  @IsString()
  @IsNotEmpty()
  workerId!: string;

  @IsIn(ACTOR_TYPES)
  agentType!: ActorType;

  @IsString()
  @IsNotEmpty()
  agentId!: string;

  @IsString()
  @IsNotEmpty()
  provider!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  taskId?: string;
}

export class AdvanceSessionDto {
  @IsOptional()
  @IsIn(SESSION_STATUSES)
  status?: SessionStatus;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;
}

export class ProviderAvailabilityDto {
  @IsIn(["RESTORE", "DISABLE", "QUOTA_EXHAUSTED"])
  action!: "RESTORE" | "DISABLE" | "QUOTA_EXHAUSTED";

  @IsOptional()
  @IsDateString()
  until?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;
}

export class ListQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  limit?: number;
}

function toWorkerView(worker: WorkerNode, now: Date, staleMs: number) {
  return {
    id: worker.id.value,
    hostname: worker.hostname,
    architecture: worker.architecture,
    operatingSystem: worker.operatingSystem,
    capabilities: worker.capabilities,
    labels: worker.labels,
    status: worker.status,
    /** §17.7 — judged at read, not by a sweep that could itself be late. */
    stale: worker.isStaleAt(now, staleMs),
    lastHeartbeatAt: worker.lastHeartbeatAt?.toISOString() ?? null,
    allowedStatusTargets: worker.allowedStatusTargets(),
  };
}

function toSessionView(session: AgentSession) {
  return {
    id: session.id.value,
    agent: { type: session.agent.type, id: session.agent.actorId },
    workerId: session.workerId,
    provider: session.provider,
    model: session.model,
    taskId: session.taskId,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    endReason: session.endReason,
    allowedStatusTargets: session.allowedStatusTargets(),
  };
}

function toProviderView(profile: ProviderProfile, now: Date) {
  return {
    id: profile.id.value,
    provider: profile.provider,
    capabilities: profile.capabilities,
    available: profile.available,
    quotaUnavailableUntil: profile.quotaUnavailableUntil?.toISOString() ?? null,
    quotaReason: profile.quotaReason,
    /** §4.14 — computed, never stored, so it cannot drift from its inputs. */
    effectiveAvailable: profile.isAvailableAt(now),
  };
}

/** §17.7 default, until a workspace policy tightens it. */
const DEFAULT_WORKER_STALE_MS = 2 * 60 * 1000;

/**
 * Machines live above workspaces: registering one is not a workspace act,
 * because it has no workspace yet (§6.3). The catalogue of providers is
 * global too (§4.14), so both sit outside `/workspaces/:id`.
 */
@Controller("runtime")
@UseGuards(ActorAuthGuard)
export class RuntimeController {
  constructor(
    private readonly registerWorker: RegisterWorkerUseCase,
    private readonly heartbeat: WorkerHeartbeatUseCase,
    private readonly setAvailability: SetProviderAvailabilityUseCase,
    @Inject(PROVIDER_STORE) private readonly providers: ProviderStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * §6.3 — a machine announces itself. No workspace permission: it belongs to
   * none yet. Authentication still applies, so only a known actor may.
   */
  @Post("workers")
  async register(@Body() dto: RegisterWorkerDto): Promise<{ workerId: string }> {
    const result = await this.registerWorker.execute(dto);
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
  }

  @Post("workers/:workerId/heartbeat")
  @HttpCode(200)
  async beat(
    @Param("workerId") workerId: string,
    @Body() dto: HeartbeatDto,
  ): Promise<{ ok: true }> {
    const result = await this.heartbeat.execute({ workerId, status: dto.status });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return { ok: true };
  }

  /** §4.14 — a global catalogue, readable by any authenticated actor. */
  @Get("providers")
  async listProviders(@Query() query: ListQueryDto) {
    const now = this.clock.now();
    return (await this.providers.list(query.limit)).map((profile) =>
      toProviderView(profile, now),
    );
  }

  /**
   * §4.14 and §7.15 — availability changes by an explicit, attributed act.
   * Nothing here reads what an agent produced, so an agent writing "429" in
   * its own output can lock nobody out (0.3.8).
   */
  @Post("providers/:provider/availability")
  @HttpCode(200)
  async availability(
    @Param("provider") provider: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: ProviderAvailabilityDto,
  ): Promise<{ ok: true }> {
    // A provider lockout is account-wide (§4.14): only a human decides it.
    if (actor.actorType !== "HUMAN") {
      throw toHttpException(
        {
          name: "ProviderLockoutError",
          message:
            "a provider's availability is account-wide — only a human sets it (§4.14)",
        },
        { forbidden: ["ProviderLockoutError"] },
      );
    }
    const result = await this.setAvailability.execute({
      provider,
      action: dto.action,
      until: dto.until ? new Date(dto.until) : undefined,
      reason: dto.reason,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return { ok: true };
  }
}

/** What a workspace may see and do about the machines that serve it. */
@Controller("workspaces/:workspaceId/runtime")
@UseGuards(ActorAuthGuard, PermissionsGuard)
export class WorkspaceRuntimeController {
  constructor(
    private readonly attach: AttachWorkerUseCase,
    private readonly startSession: StartSessionUseCase,
    private readonly advance: AdvanceSessionUseCase,
    @Inject(WORKER_STORE) private readonly workers: WorkerStore,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * §6.3 / §18.8 — the bootstrap case. The workspace authorises through
   * `manage_machines`; what is skipped is only the check that the machine
   * already belongs here, which is what this very call establishes.
   */
  @Post("workers")
  @HttpCode(200)
  @RequirePermission("manage_machines")
  async link(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: AttachWorkerDto,
  ): Promise<{ ok: true }> {
    const result = await this.attach.execute({
      workspaceId,
      workerId: dto.workerId,
      attach: true,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return { ok: true };
  }

  @Post("workers/:workerId/detach")
  @HttpCode(200)
  @RequirePermission("manage_machines")
  async unlink(
    @Param("workspaceId") workspaceId: string,
    @Param("workerId") workerId: string,
  ): Promise<{ ok: true }> {
    const result = await this.attach.execute({ workspaceId, workerId, attach: false });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return { ok: true };
  }

  /** §6.10 — a workspace only ever sees the machines that serve it. */
  @Get("workers")
  @RequirePermission("read_workspace_state")
  async listWorkers(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListQueryDto,
  ) {
    const now = this.clock.now();
    const workers = await this.workers.listForWorkspace(workspaceId, query.limit);
    return workers.map((worker) =>
      toWorkerView(worker, now, DEFAULT_WORKER_STALE_MS),
    );
  }

  @Post("sessions")
  @RequirePermission("execute_tasks")
  async start(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: StartSessionDto,
  ): Promise<{ sessionId: string }> {
    const result = await this.startSession.execute({ workspaceId, ...dto });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        conflicts: ["ProviderUnavailableError"],
        forbidden: ["WorkerNotAttachedError"],
      });
    }
    return result.value;
  }

  @Get("sessions")
  @RequirePermission("read_workspace_state")
  async listSessions(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListQueryDto,
  ) {
    return (
      await this.sessions.list({ workspaceId, limit: query.limit })
    ).map(toSessionView);
  }

  @Post("sessions/:sessionId")
  @HttpCode(200)
  @RequirePermission("execute_tasks")
  async advanceSession(
    @Param("workspaceId") workspaceId: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: AdvanceSessionDto,
  ): Promise<{ ok: true }> {
    const result = await this.advance.execute({
      workspaceId,
      sessionId,
      status: dto.status,
      reason: dto.reason,
    });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return { ok: true };
  }
}
