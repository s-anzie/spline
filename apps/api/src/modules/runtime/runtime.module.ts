import {
  AgentSessionStatus,
  LocalMachineRuntimeStatus,
  ProcessStatus,
} from "@repo/db";
import { Inject, Module, OnModuleInit } from "@nestjs/common";

import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../kernel/domain/ports/event-publisher.port";
import { AgentModule } from "../agent/agent.module";
import { ResourceLockModule } from "../resource-lock/resource-lock.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { ApproveAgentSessionUseCase } from "./application/approve-agent-session.use-case";
import { AppendSessionOutputUseCase } from "./application/append-session-output.use-case";
import { DenyAgentSessionUseCase } from "./application/deny-agent-session.use-case";
import { GetAgentSessionUseCase } from "./application/get-agent-session.use-case";
import { GetProcessUseCase } from "./application/get-process.use-case";
import { GetRuntimeHealthUseCase } from "./application/get-runtime-health.use-case";
import { LinkMachineToWorkspaceUseCase } from "./application/link-machine-to-workspace.use-case";
import { ListAgentSessionsByWorkspaceUseCase } from "./application/list-agent-sessions-by-workspace.use-case";
import { ListSessionOutputsUseCase } from "./application/list-session-outputs.use-case";
import { ListMachinesByWorkspaceUseCase } from "./application/list-machines-by-workspace.use-case";
import { ListProcessesByWorkspaceUseCase } from "./application/list-processes-by-workspace.use-case";
import { ManageMachineCredentialUseCase } from "./application/manage-machine-credential.use-case";
import { RegisterMachineUseCase } from "./application/register-machine.use-case";
import { ReconcileMachineSessionsUseCase } from "./application/reconcile-machine-sessions.use-case";
import { RegisterProcessUseCase } from "./application/register-process.use-case";
import { ReportProcessExitedUseCase } from "./application/report-process-exited.use-case";
import { ReportProcessStartedUseCase } from "./application/report-process-started.use-case";
import { ReportSessionStatusUseCase } from "./application/report-session-status.use-case";
import { ReportProviderSessionIdUseCase } from "./application/report-provider-session-id.use-case";
import { RestartProcessUseCase } from "./application/restart-process.use-case";
import { SendSessionHeartbeatUseCase } from "./application/send-session-heartbeat.use-case";
import { StartAgentSessionUseCase } from "./application/start-agent-session.use-case";
import { StartProcessUseCase } from "./application/start-process.use-case";
import { StopAgentSessionUseCase } from "./application/stop-agent-session.use-case";
import { StopProcessUseCase } from "./application/stop-process.use-case";
import { UpdateMachinePresenceUseCase } from "./application/update-machine-presence.use-case";
import { CollaborationWakeScheduler } from "./application/collaboration-wake-scheduler";
import { NotifyManagerOnSessionFailure } from "./application/notify-manager-on-session-failure";
import {
  AGENT_SESSION_REPOSITORY,
  AgentSessionRepository,
} from "./domain/ports/agent-session.repository.port";
import {
  LOCAL_MACHINE_REPOSITORY,
  LocalMachineRepository,
} from "./domain/ports/local-machine.repository.port";
import {
  PROCESS_REPOSITORY,
  ProcessRepository,
} from "./domain/ports/process.repository.port";
import { RUNTIME_COMMAND_REPOSITORY } from "./domain/ports/runtime-command.repository.port";
import { PrismaAgentSessionRepository } from "./infrastructure/prisma-agent-session.repository";
import { PrismaLocalMachineRepository } from "./infrastructure/prisma-local-machine.repository";
import { PrismaProcessRepository } from "./infrastructure/prisma-process.repository";
import { PrismaRuntimeCommandRepository } from "./infrastructure/prisma-runtime-command.repository";
import { AgentSessionController } from "./interface/agent-session.controller";
import { MachineController } from "./interface/machine.controller";
import { MachineGateway } from "./interface/machine.gateway";
import { MachineRegistrationController } from "./interface/machine-registration.controller";
import { ProcessController } from "./interface/process.controller";
import { CollaborationController } from "./interface/collaboration.controller";
import { RuntimeHealthController } from "./interface/runtime-health.controller";

@Module({
  imports: [WorkspaceModule, AgentModule, ResourceLockModule],
  controllers: [
    MachineRegistrationController,
    MachineController,
    ProcessController,
    AgentSessionController,
    CollaborationController,
    RuntimeHealthController,
  ],
  providers: [
    RegisterMachineUseCase,
    ReconcileMachineSessionsUseCase,
    LinkMachineToWorkspaceUseCase,
    ListMachinesByWorkspaceUseCase,
    ManageMachineCredentialUseCase,
    UpdateMachinePresenceUseCase,
    RegisterProcessUseCase,
    GetProcessUseCase,
    ListProcessesByWorkspaceUseCase,
    StartProcessUseCase,
    StopProcessUseCase,
    RestartProcessUseCase,
    ReportProcessStartedUseCase,
    ReportProcessExitedUseCase,
    StartAgentSessionUseCase,
    CollaborationWakeScheduler,
    NotifyManagerOnSessionFailure,
    StopAgentSessionUseCase,
    SendSessionHeartbeatUseCase,
    ReportSessionStatusUseCase,
    ReportProviderSessionIdUseCase,
    ApproveAgentSessionUseCase,
    AppendSessionOutputUseCase,
    ListSessionOutputsUseCase,
    DenyAgentSessionUseCase,
    GetAgentSessionUseCase,
    GetRuntimeHealthUseCase,
    ListAgentSessionsByWorkspaceUseCase,
    MachineGateway,
    {
      provide: LOCAL_MACHINE_REPOSITORY,
      useClass: PrismaLocalMachineRepository,
    },
    { provide: PROCESS_REPOSITORY, useClass: PrismaProcessRepository },
    {
      provide: AGENT_SESSION_REPOSITORY,
      useClass: PrismaAgentSessionRepository,
    },
    {
      provide: RUNTIME_COMMAND_REPOSITORY,
      useClass: PrismaRuntimeCommandRepository,
    },
  ],
})
export class RuntimeModule implements OnModuleInit {
  constructor(
    @Inject(LOCAL_MACHINE_REPOSITORY)
    private readonly machines: LocalMachineRepository,
    @Inject(PROCESS_REPOSITORY) private readonly processes: ProcessRepository,
    @Inject(AGENT_SESSION_REPOSITORY)
    private readonly sessions: AgentSessionRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  /**
   * Sockets never survive an API restart, so any machine/process/session
   * persisted as "active" is stale by construction right after boot — mark
   * it accordingly. A reconnecting daemon re-registers whatever it's still
   * genuinely running through the normal report flow. This is the concrete
   * substance behind "reprise après crash" (no periodic sweep needed).
   */
  async onModuleInit(): Promise<void> {
    const activeMachines = await this.machines.listActive();
    for (const machine of activeMachines) {
      machine.changeRuntimeStatus(LocalMachineRuntimeStatus.OFFLINE);
      await this.machines.save(machine);
    }

    const activeProcesses = await this.processes.listActive();
    for (const process of activeProcesses) {
      process.changeStatus(ProcessStatus.CRASHED);
      await this.processes.save(process);
    }

    const activeSessions = await this.sessions.listActive();
    for (const session of activeSessions) {
      session.changeStatus(AgentSessionStatus.CRASHED);
      await this.sessions.save(session);
      this.eventPublisher.publishAll(session.domainEvents);
      session.clearEvents();
    }
  }
}
