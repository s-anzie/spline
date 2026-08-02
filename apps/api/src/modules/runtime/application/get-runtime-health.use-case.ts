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

export interface RuntimeHealthSummary {
  machines: { total: number; online: number; stale: number; offline: number };
  sessions: { active: number; stale: number };
  commands: { pending: number; stuck: number };
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
    let machinesStale = 0;
    let machinesOffline = 0;
    for (const machine of machineList) {
      if (machine.runtimeStatus === LocalMachineRuntimeStatus.OFFLINE) {
        machinesOffline++;
      } else if (machine.isStale(now, MACHINE_STALE_TTL_MS)) {
        machinesStale++;
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

    return {
      machines: {
        total: machineList.length,
        online: machinesOnline,
        stale: machinesStale,
        offline: machinesOffline,
      },
      sessions: { active: sessionList.length, stale: staleSessions.length },
      commands: { pending: commandList.length, stuck: stuckCommands.length },
      computedAt: now,
    };
  }
}
