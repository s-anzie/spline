import {
  ActorType,
  AgentSessionStatus,
  WorkspaceRole,
} from "@repo/db";

import { EventPublisher } from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { PrismaService } from "../../../prisma/prisma.service";
import { AgentSessionStatusChanged } from "../domain/agent-session-events";
import { NotifyManagerOnSessionFailure } from "./notify-manager-on-session-failure";
import { StartAgentSessionUseCase } from "./start-agent-session.use-case";

describe("NotifyManagerOnSessionFailure", () => {
  const session = {
    id: "session-1",
    workspaceId: "workspace-1",
    agentId: "contributor-1",
    machineId: "machine-1",
    currentTaskId: "task-1",
    updatedAt: new Date("2026-08-03T00:00:00.000Z"),
    agent: { displayName: "Contributor" },
  };
  const managerSession = {
    id: "manager-session-1",
    machineId: "machine-1",
  };

  function setup() {
    const prisma = {
      agentSession: {
        findUnique: jest.fn().mockResolvedValue(session),
        findFirst: jest.fn().mockResolvedValue(managerSession),
      },
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({
          role: WorkspaceRole.AGENT_CONTRIBUTOR,
        }),
        findFirst: jest.fn().mockResolvedValue({
          actorId: "manager-1",
          role: WorkspaceRole.AGENT_MANAGER,
        }),
        findMany: jest.fn().mockResolvedValue([
          { actorId: "human-1" },
        ]),
      },
      task: {
        findUnique: jest.fn().mockResolvedValue({ title: "Implement feature" }),
      },
      resourceLock: {
        findMany: jest.fn().mockResolvedValue([
          { id: "lock-1", resourceType: "TASK", resourceId: "task-1" },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      event: { create: jest.fn().mockResolvedValue({}) },
      notification: { create: jest.fn().mockResolvedValue({}) },
      notificationRecipient: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<void>): Promise<void> =>
        callback(prisma),
    );
    const startSession = {
      execute: jest.fn().mockResolvedValue(Result.ok({})),
    };
    const eventPublisher = { publish: jest.fn(), publishAll: jest.fn() };
    const listener = new NotifyManagerOnSessionFailure(
      prisma as unknown as PrismaService,
      startSession as unknown as StartAgentSessionUseCase,
      eventPublisher as EventPublisher,
    );
    return { prisma, startSession, eventPublisher, listener };
  }

  it("records an incident, directly notifies the manager and wakes its idle session", async () => {
    const { prisma, startSession, eventPublisher, listener } = setup();

    await listener.handle(
      new AgentSessionStatusChanged(
        "workspace-1",
        "session-1",
        AgentSessionStatus.RUNNING,
        AgentSessionStatus.FAILED,
      ),
    );

    expect(prisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "agent_session.failure_detected",
          workspaceId: "workspace-1",
        }),
      }),
    );
    expect(prisma.notificationRecipient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientType: ActorType.AGENT,
        recipientId: "manager-1",
      }),
    });
    expect(startSession.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "manager-1",
        resumeFromSessionId: "manager-session-1",
      }),
    );
    expect(prisma.resourceLock.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["lock-1"] } },
      data: { releasedAt: expect.any(Date) },
    });
    expect(eventPublisher.publish).toHaveBeenCalledTimes(2);
  });

  it("ignores a normal status transition", async () => {
    const { prisma, listener } = setup();

    await listener.handle(
      new AgentSessionStatusChanged(
        "workspace-1",
        "session-1",
        AgentSessionStatus.STARTING,
        AgentSessionStatus.RUNNING,
      ),
    );

    expect(prisma.agentSession.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("escalates a manager session failure to the human operator", async () => {
    const { prisma, startSession, listener } = setup();
    prisma.workspaceMembership.findUnique.mockResolvedValue({
      role: WorkspaceRole.AGENT_MANAGER,
    });

    await listener.handle(
      new AgentSessionStatusChanged(
        "workspace-1",
        "session-1",
        AgentSessionStatus.RUNNING,
        AgentSessionStatus.CRASHED,
      ),
    );

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.notificationRecipient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientType: ActorType.HUMAN,
        recipientId: "human-1",
      }),
    });
    expect(startSession.execute).not.toHaveBeenCalled();
  });
});
