import { ActorType, AgentSessionStatus, RuntimeCommandType } from "@repo/db";
import { Inject, Injectable, Optional } from "@nestjs/common";

import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { PrismaService } from "../../../prisma/prisma.service";
import { GetAgentUseCase } from "../../agent/application/get-agent.use-case";
import { AgentNotEligibleError, AgentNotFoundError } from "../../agent/application/agent-application.errors";
import { GetWorkspaceUseCase } from "../../workspace/application/get-workspace.use-case";
import { WorkspaceNotFoundError } from "../../workspace/application/workspace-application.errors";
import { AgentSession } from "../domain/agent-session";
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
import { RuntimeCommand } from "../domain/runtime-command";
import { buildSessionSystemPrompt } from "./build-session-system-prompt";
import { MACHINE_STALE_TTL_MS } from "../domain/runtime-thresholds";
import {
  AgentAlreadyHasActiveSessionError,
  AgentSessionNotFoundError,
  AgentSessionNotResumableError,
  MachineNotConnectedError,
  MachineNotFoundError,
  MachineNotLinkedToWorkspaceError,
  WorkspaceRootPathNotConfiguredError,
} from "./runtime-application.errors";

export interface StartAgentSessionInput {
  workspaceId: string;
  agentId: string;
  machineId: string;
  taskId?: string;
  resumeFromSessionId?: string;
  /** Preserve the Spline conversation lineage without resuming provider-native state. */
  lineageFromSessionId?: string;
  instruction?: string;
  requesterType?: ActorType;
}

export type StartAgentSessionError =
  | WorkspaceNotFoundError
  | WorkspaceRootPathNotConfiguredError
  | AgentNotFoundError
  | AgentNotEligibleError
  | MachineNotFoundError
  | MachineNotLinkedToWorkspaceError
  | MachineNotConnectedError
  | AgentAlreadyHasActiveSessionError
  | AgentSessionNotFoundError
  | AgentSessionNotResumableError;

@Injectable()
export class StartAgentSessionUseCase {
  private readonly agentStartTails = new Map<string, Promise<void>>();

  constructor(
    @Inject(AGENT_SESSION_REPOSITORY)
    private readonly sessions: AgentSessionRepository,
    private readonly getWorkspace: GetWorkspaceUseCase,
    private readonly getAgent: GetAgentUseCase,
    @Inject(LOCAL_MACHINE_REPOSITORY)
    private readonly machines: LocalMachineRepository,
    @Inject(RUNTIME_COMMAND_REPOSITORY)
    private readonly commands: RuntimeCommandRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async execute(
    input: StartAgentSessionInput,
  ): Promise<Result<AgentSession, StartAgentSessionError>> {
    const previous = this.agentStartTails.get(input.agentId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.agentStartTails.set(input.agentId, tail);
    await previous;
    try {
      return await this.executeSerialized(input);
    } finally {
      release();
      if (this.agentStartTails.get(input.agentId) === tail)
        this.agentStartTails.delete(input.agentId);
    }
  }

  private async executeSerialized(
    input: StartAgentSessionInput,
  ): Promise<Result<AgentSession, StartAgentSessionError>> {
    const workspaceResult = await this.getWorkspace.execute(input.workspaceId);
    if (workspaceResult.isFailure) {
      return Result.fail(workspaceResult.error);
    }
    const workspace = workspaceResult.value;
    if (!workspace.rootPath) {
      return Result.fail(
        new WorkspaceRootPathNotConfiguredError(input.workspaceId),
      );
    }

    const agentResult = await this.getAgent.execute(input.agentId);
    if (
      agentResult.isFailure ||
      agentResult.value.workspaceId !== input.workspaceId
    ) {
      return Result.fail(new AgentNotFoundError(input.agentId));
    }
    const agent = agentResult.value;
    if (agent.isDisabled) {
      return Result.fail(new AgentNotEligibleError(input.agentId));
    }
    const role = agent.promptProfile?.["role"];
    if (input.requesterType === ActorType.HUMAN && role !== "manager") {
      return Result.fail(
        new AgentSessionNotResumableError(
          "Humans can only start conversations with a manager agent",
        ),
      );
    }

    let resumeProviderSessionId: string | undefined;
    let idleSession: AgentSession | undefined;
    const automaticSource = input.resumeFromSessionId
      ? null
      : await this.sessions.findLatestReusableByAgent(
          input.agentId,
          agent.provider,
        );
    const sourceSessionId =
      input.resumeFromSessionId ?? automaticSource?.id.toString();
    if (sourceSessionId) {
      const source = await this.sessions.findById(
        UniqueEntityId.create(sourceSessionId),
      );
      if (
        !source ||
        source.workspaceId !== input.workspaceId ||
        source.agentId !== input.agentId
      ) {
        return Result.fail(
          new AgentSessionNotFoundError(sourceSessionId),
        );
      }
      const reusableStatus = new Set<AgentSessionStatus>([
        AgentSessionStatus.IDLE,
        AgentSessionStatus.FAILED,
        AgentSessionStatus.CRASHED,
      ]).has(source.status);
      const providerChanged = source.provider !== agent.provider;
      if (providerChanged && source.status === AgentSessionStatus.IDLE) {
        // Native conversation ids are provider-specific. Close the old idle
        // turn so it no longer blocks the agent, then create a fresh provider
        // conversation while retaining resumedFromSessionId as Spline lineage.
        source.changeStatus(AgentSessionStatus.COMPLETED);
        await this.sessions.save(source);
        this.eventPublisher.publishAll(source.domainEvents);
        source.clearEvents();
      } else if (
        (!source.isTerminal && !reusableStatus) ||
        (source.isTerminal && !reusableStatus) ||
        (!providerChanged && !source.providerSessionId)
      ) {
        return Result.fail(
          new AgentSessionNotResumableError(sourceSessionId),
        );
      }
      if (!providerChanged) {
        resumeProviderSessionId = source.providerSessionId;
        if (reusableStatus) idleSession = source;
      }
    }

    const now = this.clock.now();
    const machine = await this.machines.findById(
      UniqueEntityId.create(input.machineId),
    );
    if (!machine) {
      return Result.fail(new MachineNotFoundError(input.machineId));
    }
    if (!machine.workspaceIds.includes(input.workspaceId)) {
      return Result.fail(
        new MachineNotLinkedToWorkspaceError(
          input.machineId,
          input.workspaceId,
        ),
      );
    }
    // An OFFLINE machine is fine — the command queues and delivers once it
    // connects. A machine that CLAIMS to be online but hasn't heartbeated
    // recently is the actual failure mode: the command would sit "SENT"
    // forever against a connection that's already dead.
    if (machine.isStale(now, MACHINE_STALE_TTL_MS)) {
      return Result.fail(new MachineNotConnectedError(input.machineId));
    }

    const activeSessions = await this.sessions.listActiveByAgent(input.agentId);
    // There must be one durable collaboration conversation per agent. Any
    // older orphan IDLE row is closed, while the latest compatible provider
    // conversation is woken in place even when its assigned task changes.
    for (const active of activeSessions) {
      if (
        active.id.toString() !== idleSession?.id.toString() &&
        active.status === AgentSessionStatus.IDLE
      ) {
        active.changeStatus(AgentSessionStatus.COMPLETED, now);
        await this.sessions.save(active);
        this.eventPublisher.publishAll(active.domainEvents);
        active.clearEvents();
      }
    }
    const remainingActiveSessions = await this.sessions.listActiveByAgent(
      input.agentId,
    );
    if (
      remainingActiveSessions.some(
        (active) => active.id.toString() !== idleSession?.id.toString(),
      )
    ) {
      return Result.fail(new AgentAlreadyHasActiveSessionError(input.agentId));
    }

    const instruction = input.instruction?.trim() || "Synchronize the workspace and report the next required action.";
    const session = idleSession ?? AgentSession.start(
      {
        agentId: input.agentId,
        provider: agent.provider,
        workspaceId: input.workspaceId,
        machineId: input.machineId,
        currentTaskId: input.taskId,
        providerSessionId: resumeProviderSessionId,
        resumedFromSessionId:
          input.resumeFromSessionId ?? input.lineageFromSessionId,
        instruction,
      },
      now,
    );
    if (idleSession)
      idleSession.prepareWake(now, {
        taskId: input.taskId,
        instruction,
      });
    await this.sessions.save(session);
    let latestOutput = this.prisma
      ? await this.prisma.agentSessionOutput.findFirst({
          where: { sessionId: session.id.toString() },
          orderBy: { sequence: "desc" },
          select: { sequence: true },
        })
      : null;
    if (idleSession && input.requesterType === ActorType.HUMAN && this.prisma) {
      latestOutput = await this.prisma.agentSessionOutput.create({
        data: {
          sessionId: session.id.toString(),
          sequence: (latestOutput?.sequence ?? -1) + 1,
          stream: "STDOUT",
          content: `${JSON.stringify({ type: "spline.user_message", message: instruction })}\n`,
        },
        select: { sequence: true },
      });
    }

    const systemPrompt = buildSessionSystemPrompt(
      { name: workspace.name, ruleset: workspace.ruleset },
      {
        provider: agent.provider,
        displayName: agent.displayName,
        capabilities: [...agent.capabilities],
        permissions: [...agent.permissions],
        promptProfile: agent.promptProfile,
      },
    );
    const prompt = `${systemPrompt}\n\nCurrent instruction:\n${instruction}`;
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
          resumeProviderSessionId,
          outputSequenceStart: (latestOutput?.sequence ?? -1) + 1,
          env: { SPLINE_AGENT_ROLE: typeof role === "string" ? role : "unknown" },
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
