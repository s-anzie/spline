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
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { ConfigService } from "@nestjs/config";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
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
  ClaimCommandsUseCase,
  EnqueueCommandUseCase,
  ReportCommandUseCase,
  ResolveCommandGrantUseCase,
  ResolveCommandSecretsUseCase,
} from "../application/command.use-cases";
import { DispatchTaskUseCase } from "../application/dispatch-task.use-case";
import { RecoverCrashedSessionsUseCase } from "../application/recover-crashed-sessions.use-case";
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
  COMMAND_STORE,
  CommandStore,
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

export class EnqueueCommandDto {
  @IsString()
  @IsNotEmpty()
  workerId!: string;

  /** Free string: §19.3 will publish Tools with their own orders. */
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsOptional()
  payload?: Record<string, unknown>;
}

export class ClaimCommandsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  max?: number;
}

export class ReportCommandDto {
  @IsIn(["COMPLETED", "FAILED"])
  outcome!: "COMPLETED" | "FAILED";

  @IsOptional()
  result?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  failureReason?: string;
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

export class DispatchTaskDto {
  @IsString()
  @IsNotEmpty()
  taskId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  provider!: string;

  /** Absent means "choose one that can run this provider" (§9.9). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  workerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  /** §18.4 — names only. Values never travel in an order. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  secretNames?: string[];
}

export class RequestEnrolmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  hostname!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  architecture!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
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

export class ClaimEnrolmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  deviceId!: string;
}

export class DecideEnrolmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  code!: string;

  @IsOptional()
  @IsBoolean()
  approve?: boolean;
}

/**
 * §18.10 — how long a task grant lives. Long enough for a run that takes its
 * full timeout, short enough that a leaked one is worth little. It is not the
 * task's timeout because the two answer different questions: one bounds work,
 * the other bounds a credential.
 */
const GRANT_TTL_MS = 60 * 60 * 1000;

/** §17.7 default, until a workspace policy tightens it. */
const DEFAULT_WORKER_STALE_MS = 2 * 60 * 1000;

/**
 * 403 rather than 404: the machine exists, and answering "not found" would
 * send an operator debugging a machine that is fine (§20.6).
 */
const IMPERSONATION = ["WorkerImpersonationError"];

function asActorRef(actor: ActorIdentity): ActorRef {
  // The guard already resolved this identity, so the reference cannot be
  // invalid here — `.value` is safe by the time the request reaches a route.
  return ActorRef.create(actor.actorType, actor.actorId).value;
}

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
    private readonly claimCommands: ClaimCommandsUseCase,
    private readonly reportCommand: ReportCommandUseCase,
    private readonly resolveCommandSecrets: ResolveCommandSecretsUseCase,
    private readonly resolveCommandGrant: ResolveCommandGrantUseCase,
    @Inject(PROVIDER_STORE) private readonly providers: ProviderStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * §6.3 — a machine announces itself. No workspace permission: it belongs to
   * none yet. Authentication still applies, so only a known actor may.
   */
  @Post("workers")
  async register(
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: RegisterWorkerDto,
  ): Promise<{ workerId: string }> {
    const result = await this.registerWorker.execute({
      ...dto,
      registeredBy: asActorRef(actor),
    });
    if (result.isFailure) {
      throw toHttpException(result.error, { forbidden: IMPERSONATION });
    }
    return result.value;
  }

  @Post("workers/:workerId/heartbeat")
  @HttpCode(200)
  async beat(
    @Param("workerId") workerId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: HeartbeatDto,
  ): Promise<{ ok: true }> {
    const result = await this.heartbeat.execute({
      workerId,
      actor: asActorRef(actor),
      status: dto.status,
    });
    if (result.isFailure) {
      throw toHttpException(result.error, { forbidden: IMPERSONATION });
    }
    return { ok: true };
  }

  /**
   * §6.8 — a worker PULLS its orders. The hub never pushes: a worker
   * connects outward, and an unclaimed order must survive a hub restart.
   * Pulling doubles as a heartbeat — a worker asking for work is plainly
   * there, and needing a separate beat would let a busy one look silent.
   */
  @Post("workers/:workerId/commands/claim")
  @HttpCode(200)
  async claim(
    @Param("workerId") workerId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: ClaimCommandsDto,
  ) {
    const result = await this.claimCommands.execute({
      workerId,
      actor: asActorRef(actor),
      max: dto.max,
    });
    if (result.isFailure) {
      throw toHttpException(result.error, { forbidden: IMPERSONATION });
    }
    return result.value;
  }

  /**
   * §18.4 — the only path a secret value ever takes out of this system.
   *
   * Everything about this route is shaped by that. The worker asks while
   * HOLDING the order, so the credential goes to the machine that is about to
   * use it and nowhere else. The names come from the order the hub itself
   * enqueued, never from the request — a worker that could name the secrets
   * it wants would be able to ask for all of them. Nothing is stored: the
   * value exists for the length of one response, never in the command row,
   * never in the journal. And reading one is an act, so it is audited
   * (§18.7).
   */
  @Post("workers/:workerId/commands/:commandId/secrets")
  @HttpCode(200)
  async secrets(
    @Param("workerId") workerId: string,
    @Param("commandId") commandId: string,
    @CurrentActor() actor: ActorIdentity,
  ): Promise<Record<string, string>> {
    const result = await this.resolveCommandSecrets.execute({
      workerId,
      commandId,
      actor: asActorRef(actor),
    });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        forbidden: [...IMPERSONATION, "CommandAlreadyClaimedError"],
      });
    }
    return result.value;
  }

  /**
   * §18.10, §10 — the credential an agent uses to call back mid-task.
   *
   * Same conditions as the secrets route: the caller is the machine, the
   * machine holds the order, and whose authority it borrows comes from the
   * TASK rather than from the request. The token expires with the run.
   */
  @Post("workers/:workerId/commands/:commandId/grant")
  @HttpCode(200)
  async grant(
    @Param("workerId") workerId: string,
    @Param("commandId") commandId: string,
    @CurrentActor() actor: ActorIdentity,
  ) {
    const result = await this.resolveCommandGrant.execute({
      workerId,
      commandId,
      actor: asActorRef(actor),
      ttlMs: GRANT_TTL_MS,
    });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        forbidden: [...IMPERSONATION, "CommandAlreadyClaimedError"],
        conflicts: ["NoGrantableScopesError"],
      });
    }
    return result.value;
  }

  /** Only the worker holding an order may say what became of it. */
  @Post("workers/:workerId/commands/:commandId/report")
  @HttpCode(200)
  async report(
    @Param("workerId") workerId: string,
    @Param("commandId") commandId: string,
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: ReportCommandDto,
  ): Promise<{ ok: true }> {
    const result = await this.reportCommand.execute({
      commandId,
      workerId,
      actor: asActorRef(actor),
      outcome: dto.outcome,
      result: dto.result,
      failureReason: dto.failureReason,
    });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        forbidden: ["CommandAlreadyClaimedError", ...IMPERSONATION],
      });
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
    private readonly recover: RecoverCrashedSessionsUseCase,
    private readonly enqueueCommand: EnqueueCommandUseCase,
    private readonly dispatchTask: DispatchTaskUseCase,
    @Inject(COMMAND_STORE) private readonly commands: CommandStore,
    @Inject(WORKER_STORE) private readonly workers: WorkerStore,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(CLOCK) private readonly clock: Clock,
    config: ConfigService,
  ) {
    /**
     * Where an agent reports back. Read once here rather than at each
     * dispatch: a prompt that told an agent a different address each time
     * would be a prompt nobody could reproduce.
     */
    this.hubUrl =
      config.get<string>("PUBLIC_HUB_URL") ??
      `http://localhost:${config.get<string>("PORT") ?? "8765"}`;
  }

  private readonly hubUrl: string;

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

  /**
   * §6.8 — "le hub DÉCIDE et enfile". The decision is the hub's.
   *
   * This was `execute_tasks`, which an AGENT_CONTRIBUTOR holds — so an agent
   * could put an arbitrary order, with an arbitrary payload, on the queue of
   * a machine an operator owns. That is the whole indirect-injection chain in
   * one route: an agent reads a poisoned file, the injected instruction
   * enqueues a command, and the worker executes it on the host. The agent did
   * not have to be malicious; it only had to read.
   *
   * Operating a machine is a human act: `manage_machines` is held by OWNER
   * and HUMAN_OPERATOR, by no agent role. When the Task Engine needs to
   * enqueue on an agent's behalf it will do so AS THE HUB, from a decision it
   * made — not by handing agents the route.
   */
  /**
   * §6.8, §7.1 — hands a task to a machine: the bridge from "assigned" to
   * "running". Declared before the parametric routes, or one of them would
   * swallow it (the shadowing invariant exists because that happened once).
   */
  @Post("dispatch")
  @RequirePermission("manage_machines")
  async dispatch(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: DispatchTaskDto,
  ) {
    const result = await this.dispatchTask.execute({
      workspaceId,
      taskId: dto.taskId,
      provider: dto.provider,
      workerId: dto.workerId,
      model: dto.model,
      secretNames: dto.secretNames,
      hubUrl: this.hubUrl,
    });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        conflicts: ["TaskNotDispatchableError", "NoCapableWorkerError"],
        forbidden: ["WorkerNotAttachedError"],
      });
    }
    return result.value;
  }

  @Post("commands")
  @RequirePermission("manage_machines")
  async enqueue(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: EnqueueCommandDto,
  ): Promise<{ commandId: string }> {
    const result = await this.enqueueCommand.execute({ workspaceId, ...dto });
    if (result.isFailure) {
      throw toHttpException(result.error, {
        forbidden: ["WorkerNotAttachedError"],
      });
    }
    return result.value;
  }

  @Get("commands")
  @RequirePermission("read_workspace_state")
  async listCommands(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListQueryDto,
  ) {
    const commands = await this.commands.list({ workspaceId, limit: query.limit });
    return commands.map((command) => ({
      id: command.id.value,
      workerId: command.workerId,
      type: command.type,
      status: command.status,
      claimedBy: command.claimedBy,
      result: command.result,
      failureReason: command.failureReason,
      allowedStatusTargets: command.allowedStatusTargets(),
    }));
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
        forbidden: ["WorkerNotAttachedError", "ActorNotInWorkspaceError"],
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

  /**
   * §6.6 — "aucune tâche ne doit disparaître". Marks sessions that stopped
   * reporting, so the tasks they held come back into view. Explicit rather
   * than periodic: §9.16's second trigger does not exist yet, so this runs
   * when an operator or a reconnecting worker asks.
   */
  @Post("recover")
  @HttpCode(200)
  @RequirePermission("operate_workspace")
  async recoverSessions(@Param("workspaceId") workspaceId: string) {
    const result = await this.recover.execute({ workspaceId });
    if (result.isFailure) {
      throw toHttpException(result.error);
    }
    return result.value;
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
