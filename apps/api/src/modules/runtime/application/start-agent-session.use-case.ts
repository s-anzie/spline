import { RuntimeCommandType } from "@repo/db";
import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { EVENT_PUBLISHER, EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { GetAgentUseCase } from "../../agent/application/get-agent.use-case";
import { AgentNotFoundError } from "../../agent/application/agent-application.errors";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { AgentSession } from "../domain/agent-session";
import {
  AGENT_SESSION_REPOSITORY,
  AgentSessionRepository,
} from "../domain/ports/agent-session.repository.port";
import { LOCAL_MACHINE_REPOSITORY, LocalMachineRepository } from "../domain/ports/local-machine.repository.port";
import { RUNTIME_COMMAND_REPOSITORY, RuntimeCommandRepository } from "../domain/ports/runtime-command.repository.port";
import { RuntimeCommand } from "../domain/runtime-command";
import { buildSessionSystemPrompt } from "./build-session-system-prompt";
import {
  AgentAlreadyHasActiveSessionError,
  MachineNotFoundError,
  MachineNotLinkedToWorkspaceError,
  WorkspaceRootPathNotConfiguredError,
} from "./runtime-application.errors";

export interface StartAgentSessionInput {
  workspaceId: string;
  agentId: string;
  machineId: string;
  taskId?: string;
}

export type StartAgentSessionError =
  | WorkspaceNotFoundError
  | WorkspaceRootPathNotConfiguredError
  | AgentNotFoundError
  | MachineNotFoundError
  | MachineNotLinkedToWorkspaceError
  | AgentAlreadyHasActiveSessionError;

@Injectable()
export class StartAgentSessionUseCase {
  constructor(
    @Inject(AGENT_SESSION_REPOSITORY) private readonly sessions: AgentSessionRepository,
    private readonly getWorkspace: GetWorkspaceUseCase,
    private readonly getAgent: GetAgentUseCase,
    @Inject(LOCAL_MACHINE_REPOSITORY) private readonly machines: LocalMachineRepository,
    @Inject(RUNTIME_COMMAND_REPOSITORY) private readonly commands: RuntimeCommandRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(input: StartAgentSessionInput): Promise<Result<AgentSession, StartAgentSessionError>> {
    const workspaceResult = await this.getWorkspace.execute(input.workspaceId);
    if (workspaceResult.isFailure) {
      return Result.fail(workspaceResult.error);
    }
    const workspace = workspaceResult.value;
    if (!workspace.rootPath) {
      return Result.fail(new WorkspaceRootPathNotConfiguredError(input.workspaceId));
    }

    const agentResult = await this.getAgent.execute(input.agentId);
    if (agentResult.isFailure || agentResult.value.workspaceId !== input.workspaceId) {
      return Result.fail(new AgentNotFoundError(input.agentId));
    }
    const agent = agentResult.value;

    const machine = await this.machines.findById(UniqueEntityId.create(input.machineId));
    if (!machine) {
      return Result.fail(new MachineNotFoundError(input.machineId));
    }
    if (!machine.workspaceIds.includes(input.workspaceId)) {
      return Result.fail(new MachineNotLinkedToWorkspaceError(input.machineId, input.workspaceId));
    }

    const activeSessions = await this.sessions.listActiveByAgent(input.agentId);
    if (activeSessions.length > 0) {
      return Result.fail(new AgentAlreadyHasActiveSessionError(input.agentId));
    }

    const now = this.clock.now();
    const session = AgentSession.start(
      {
        agentId: input.agentId,
        provider: agent.provider,
        workspaceId: input.workspaceId,
        machineId: input.machineId,
        currentTaskId: input.taskId,
      },
      now,
    );
    await this.sessions.save(session);

    const prompt = buildSessionSystemPrompt(
      { name: workspace.name, ruleset: workspace.ruleset },
      { provider: agent.provider },
    );
    const command = RuntimeCommand.enqueue(
      {
        machineId: input.machineId,
        workspaceId: input.workspaceId,
        type: RuntimeCommandType.START_SESSION,
        payload: {
          sessionId: session.id.toString(),
          agentId: input.agentId,
          provider: agent.provider,
          prompt,
          taskId: input.taskId,
          cwd: workspace.rootPath,
        },
      },
      now,
    );
    await this.commands.save(command);

    this.eventPublisher.publishAll(session.domainEvents);
    session.clearEvents();

    return Result.ok(session);
  }
}
