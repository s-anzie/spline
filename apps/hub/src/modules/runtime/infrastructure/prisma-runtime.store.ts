import { Injectable } from "@nestjs/common";
import {
  RuntimeCommand as CommandRow,
  AgentSession as SessionRow,
  ProviderProfile as ProviderRow,
  WorkerNode as WorkerRow,
} from "@repo/db";

import { pageSize } from "../../../kernel/domain/pagination";
import { PrismaService } from "../../../prisma/prisma.service";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { AgentSession, SessionStatus } from "../domain/agent-session";
import { ProviderProfile } from "../domain/provider-profile";
import { CommandStatus, RuntimeCommand } from "../domain/runtime-command";
import { WorkerNode, WorkerStatus } from "../domain/worker-node";
import {
  CommandStore,
  ListCommandsFilter,
  ListSessionsFilter,
  ProviderStore,
  SessionStore,
  WorkerStore,
} from "../domain/ports/runtime.repository.port";

@Injectable()
export class PrismaWorkerStore implements WorkerStore {
  constructor(private readonly prisma: PrismaService) {}

  /** §5.19 — the whole aggregate. */
  async save(worker: WorkerNode): Promise<void> {
    const data = {
      hostname: worker.hostname,
      registeredByType: worker.registeredBy.type,
      registeredById: worker.registeredBy.actorId,
      labels: [...worker.labels],
      architecture: worker.architecture,
      operatingSystem: worker.operatingSystem,
      capabilities: [...worker.capabilities],
      workspaceIds: [...worker.workspaceIds],
      status: worker.status,
      lastHeartbeatAt: worker.lastHeartbeatAt,
      registeredAt: worker.registeredAt,
    };
    await this.prisma.workerNode.upsert({
      where: { id: worker.id.value },
      create: { id: worker.id.value, ...data },
      update: data,
    });
  }

  async findById(id: string): Promise<WorkerNode | null> {
    const row = await this.prisma.workerNode.findUnique({ where: { id } });
    return row ? toWorker(row) : null;
  }

  async findByHostname(hostname: string): Promise<WorkerNode | null> {
    const row = await this.prisma.workerNode.findUnique({ where: { hostname } });
    return row ? toWorker(row) : null;
  }

  /**
   * §6.10 — a workspace only ever sees the machines that serve it. The
   * attachment list is Json, so the filter runs in memory over a bounded
   * page: machines are counted in dozens, not millions.
   */
  async listForWorkspace(workspaceId: string, limit?: number): Promise<WorkerNode[]> {
    const rows = await this.prisma.workerNode.findMany({
      orderBy: { hostname: "asc" },
      take: pageSize(limit),
    });
    return rows.map(toWorker).filter((worker) => worker.serves(workspaceId));
  }
}

@Injectable()
export class PrismaSessionStore implements SessionStore {
  constructor(private readonly prisma: PrismaService) {}

  async save(session: AgentSession): Promise<void> {
    const data = {
      workspaceId: session.workspaceId,
      agentType: session.agent.type,
      agentId: session.agent.actorId,
      workerId: session.workerId,
      provider: session.provider,
      model: session.model,
      taskId: session.taskId,
      status: session.status,
      lastHeartbeatAt: session.lastHeartbeatAt,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      endReason: session.endReason,
    };
    await this.prisma.agentSession.upsert({
      where: { id: session.id.value },
      create: { id: session.id.value, ...data },
      update: data,
    });
  }

  async findById(id: string): Promise<AgentSession | null> {
    const row = await this.prisma.agentSession.findUnique({ where: { id } });
    return row ? toSession(row) : null;
  }

  async list(filter: ListSessionsFilter): Promise<AgentSession[]> {
    const rows = await this.prisma.agentSession.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.workerId && { workerId: filter.workerId }),
        ...(filter.liveOnly && { status: { notIn: ["STOPPED", "CRASHED"] } }),
      },
      orderBy: { startedAt: "desc" },
      take: pageSize(filter.limit),
    });
    return rows.map(toSession);
  }
}

@Injectable()
export class PrismaProviderStore implements ProviderStore {
  constructor(private readonly prisma: PrismaService) {}

  async save(profile: ProviderProfile): Promise<void> {
    const data = {
      provider: profile.provider,
      capabilities: [...profile.capabilities],
      // The three fields that decide availability are written together,
      // always, because the aggregate is the only thing that moves them
      // (§4.14, 0.3.9).
      available: profile.available,
      quotaUnavailableUntil: profile.quotaUnavailableUntil,
      quotaReason: profile.quotaReason,
      createdAt: profile.createdAt,
    };
    await this.prisma.providerProfile.upsert({
      where: { id: profile.id.value },
      create: { id: profile.id.value, ...data },
      update: data,
    });
  }

  async findById(id: string): Promise<ProviderProfile | null> {
    const row = await this.prisma.providerProfile.findUnique({ where: { id } });
    return row ? toProvider(row) : null;
  }

  async findByProvider(provider: string): Promise<ProviderProfile | null> {
    const row = await this.prisma.providerProfile.findUnique({ where: { provider } });
    return row ? toProvider(row) : null;
  }

  async list(limit?: number): Promise<ProviderProfile[]> {
    const rows = await this.prisma.providerProfile.findMany({
      orderBy: { provider: "asc" },
      take: pageSize(limit),
    });
    return rows.map(toProvider);
  }
}

function toWorker(row: WorkerRow): WorkerNode {
  return WorkerNode.reconstitute(
    {
      hostname: row.hostname,
      registeredBy: ActorRef.create(
        row.registeredByType as ActorType,
        row.registeredById,
      ).value,
      labels: (row.labels ?? []) as string[],
      architecture: row.architecture,
      operatingSystem: row.operatingSystem,
      capabilities: (row.capabilities ?? []) as string[],
      workspaceIds: (row.workspaceIds ?? []) as string[],
      status: row.status as WorkerStatus,
      lastHeartbeatAt: row.lastHeartbeatAt,
      registeredAt: row.registeredAt,
      updatedAt: row.updatedAt,
    },
    row.id,
  );
}

function toSession(row: SessionRow): AgentSession {
  return AgentSession.reconstitute(
    {
      workspaceId: row.workspaceId,
      agent: ActorRef.create(row.agentType as ActorType, row.agentId).value,
      workerId: row.workerId,
      provider: row.provider,
      model: row.model,
      taskId: row.taskId,
      status: row.status as SessionStatus,
      lastHeartbeatAt: row.lastHeartbeatAt,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      endReason: row.endReason,
    },
    row.id,
  );
}

function toProvider(row: ProviderRow): ProviderProfile {
  return ProviderProfile.reconstitute(
    {
      provider: row.provider,
      capabilities: (row.capabilities ?? []) as string[],
      available: row.available,
      quotaUnavailableUntil: row.quotaUnavailableUntil,
      quotaReason: row.quotaReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    row.id,
  );
}

@Injectable()
export class PrismaCommandStore implements CommandStore {
  constructor(private readonly prisma: PrismaService) {}

  async save(command: RuntimeCommand): Promise<void> {
    const data = {
      workspaceId: command.workspaceId,
      workerId: command.workerId,
      type: command.type,
      payload: command.payload as object,
      status: command.status,
      claimedBy: command.claimedBy,
      claimedAt: command.claimedAt,
      finishedAt: command.finishedAt,
      result: (command.result ?? undefined) as object | undefined,
      failureReason: command.failureReason,
      createdAt: command.createdAt,
    };
    await this.prisma.runtimeCommand.upsert({
      where: { id: command.id.value },
      create: { id: command.id.value, ...data },
      update: data,
    });
  }

  async findById(id: string): Promise<RuntimeCommand | null> {
    const row = await this.prisma.runtimeCommand.findUnique({ where: { id } });
    return row ? toCommand(row) : null;
  }

  async list(filter: ListCommandsFilter): Promise<RuntimeCommand[]> {
    const rows = await this.prisma.runtimeCommand.findMany({
      where: {
        workspaceId: filter.workspaceId,
        ...(filter.workerId && { workerId: filter.workerId }),
        ...(filter.pendingOnly && { status: "PENDING" }),
      },
      orderBy: { createdAt: "desc" },
      take: pageSize(filter.limit),
    });
    return rows.map(toCommand);
  }

  /** Oldest first: a queue serves in order, or it is a pile. */
  async listPendingForWorker(workerId: string, limit: number): Promise<RuntimeCommand[]> {
    const rows = await this.prisma.runtimeCommand.findMany({
      where: { workerId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: pageSize(limit, { fallback: 10, ceiling: 50 }),
    });
    return rows.map(toCommand);
  }

  async listClaimed(workspaceId: string): Promise<RuntimeCommand[]> {
    const rows = await this.prisma.runtimeCommand.findMany({
      where: { workspaceId, status: "CLAIMED" },
      orderBy: { claimedAt: "asc" },
      take: pageSize(undefined),
    });
    return rows.map(toCommand);
  }
}

function toCommand(row: CommandRow): RuntimeCommand {
  return RuntimeCommand.reconstitute(
    {
      workspaceId: row.workspaceId,
      workerId: row.workerId,
      type: row.type,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      status: row.status as CommandStatus,
      claimedBy: row.claimedBy,
      claimedAt: row.claimedAt,
      finishedAt: row.finishedAt,
      result: (row.result ?? null) as Record<string, unknown> | null,
      failureReason: row.failureReason,
      createdAt: row.createdAt,
    },
    row.id,
  );
}
