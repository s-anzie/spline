import { LocalMachineRuntimeStatus, RuntimeCommandStatus } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  MACHINE_STALE_TTL_MS,
  SESSION_STALE_TTL_MS,
  STUCK_COMMAND_TTL_MS,
} from "../domain/runtime-thresholds";
import {
  AGENT_SESSION_REPOSITORY,
  AgentSessionRepository,
} from "../domain/ports/agent-session.repository.port";
import {
  LOCAL_MACHINE_REPOSITORY,
  LocalMachineRepository,
} from "../domain/ports/local-machine.repository.port";
import {
  RUNTIME_COMMAND_REPOSITORY,
  RuntimeCommandRepository,
} from "../domain/ports/runtime-command.repository.port";

export interface StaleMachineSummary {
  id: string;
  hostname: string;
  lastSeenAt: Date | null;
}

export interface StaleSessionSummary {
  id: string;
  agentId: string;
  provider: string;
  status: string;
  lastHeartbeatAt: Date | null;
}

export interface StuckCommandSummary {
  id: string;
  machineId: string;
  hostname: string | null;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface RuntimeHealthSummary {
  machines: { total: number; online: number; stale: number; offline: number; staleDetails: StaleMachineSummary[] };
  sessions: { active: number; stale: number; staleDetails: StaleSessionSummary[] };
  commands: { pending: number; stuck: number; stuckDetails: StuckCommandSummary[] };
  computedAt: Date;
}

const NON_TERMINAL_COMMAND_STATUSES: RuntimeCommandStatus[] = [
  RuntimeCommandStatus.PENDING,
  RuntimeCommandStatus.SENT,
  RuntimeCommandStatus.ACKNOWLEDGED,
];

/**
 * The observability surface this codebase was missing: everything here was
 * previously only answerable by hand-querying Postgres and journalctl. A
 * "supervision platform" that can't report its own health defeats its own
 * purpose — see MACHINE_STALE_TTL_MS/SESSION_STALE_TTL_MS for what "stale"
 * means and why (dead sockets that never got a chance to report back).
 */
@Injectable()
export class GetRuntimeHealthUseCase {
  constructor(
    @Inject(LOCAL_MACHINE_REPOSITORY) private readonly machines: LocalMachineRepository,
    @Inject(AGENT_SESSION_REPOSITORY) private readonly sessions: AgentSessionRepository,
    @Inject(RUNTIME_COMMAND_REPOSITORY) private readonly commands: RuntimeCommandRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(workspaceId: string): Promise<RuntimeHealthSummary> {
    const now = this.clock.now();

    const machineList = await this.machines.listByWorkspace(workspaceId);
    let machinesOnline = 0;
    let machinesOffline = 0;
    const staleMachines = [];
    for (const machine of machineList) {
      if (machine.runtimeStatus === LocalMachineRuntimeStatus.OFFLINE) {
        machinesOffline++;
      } else if (machine.isStale(now, MACHINE_STALE_TTL_MS)) {
        staleMachines.push(machine);
      } else {
        machinesOnline++;
      }
    }

    const sessionList = (await this.sessions.listByWorkspace(workspaceId)).filter(
      (session) => !session.isTerminal,
    );
    const staleSessions = sessionList.filter((session) => session.isStale(now, SESSION_STALE_TTL_MS));

    const commandList = (await this.commands.listByWorkspace(workspaceId)).filter((command) =>
      NON_TERMINAL_COMMAND_STATUSES.includes(command.status),
    );
    const stuckCommands = commandList.filter(
      (command) => now.getTime() - command.createdAt.getTime() > STUCK_COMMAND_TTL_MS,
    );
    const hostnameByMachineId = new Map(machineList.map((machine) => [machine.id.toString(), machine.hostname]));

    return {
      machines: {
        total: machineList.length,
        online: machinesOnline,
        stale: staleMachines.length,
        offline: machinesOffline,
        staleDetails: staleMachines.map((machine) => ({
          id: machine.id.toString(),
          hostname: machine.hostname,
          lastSeenAt: machine.lastSeenAt ?? null,
        })),
      },
      sessions: {
        active: sessionList.length,
        stale: staleSessions.length,
        staleDetails: staleSessions.map((session) => ({
          id: session.id.toString(),
          agentId: session.agentId,
          provider: session.provider,
          status: session.status,
          lastHeartbeatAt: session.lastHeartbeatAt ?? null,
        })),
      },
      commands: {
        pending: commandList.length,
        stuck: stuckCommands.length,
        stuckDetails: stuckCommands.map((command) => ({
          id: command.id.toString(),
          machineId: command.machineId,
          hostname: hostnameByMachineId.get(command.machineId) ?? null,
          type: command.type,
          status: command.status,
          payload: command.payload,
          createdAt: command.createdAt,
        })),
      },
      computedAt: now,
    };
  }
}
