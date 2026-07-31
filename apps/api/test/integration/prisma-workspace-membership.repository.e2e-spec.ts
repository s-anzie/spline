import { WorkspaceRole } from "@repo/db";

import { PrismaWorkspaceMembershipRepository } from "../../src/modules/identity/infrastructure/prisma-workspace-membership.repository";
import { WorkspaceMembership } from "../../src/modules/identity/domain/workspace-membership";
import { PrismaService } from "../../src/prisma/prisma.service";
import { createTestPrismaService } from "./create-test-prisma-service";
import { resetDatabase } from "../setup/reset-database";

describe("PrismaWorkspaceMembershipRepository (integration)", () => {
  let prisma: PrismaService;
  let repository: PrismaWorkspaceMembershipRepository;
  let workspaceId: string;

  beforeAll(async () => {
    prisma = createTestPrismaService();
    await prisma.$connect();
    repository = new PrismaWorkspaceMembershipRepository(prisma);
  });

  beforeEach(async () => {
    const workspace = await prisma.workspace.create({ data: { name: "Test workspace" } });
    workspaceId = workspace.id;
  });

  afterEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists a membership and finds it back by actor", async () => {
    const membership = WorkspaceMembership.create({
      workspaceId,
      actorType: "HUMAN",
      actorId: "user-1",
      role: WorkspaceRole.OWNER,
    });

    await repository.save(membership);
    const found = await repository.findByActor(workspaceId, "HUMAN", "user-1");

    expect(found?.role).toBe(WorkspaceRole.OWNER);
  });

  it("lists every membership of a workspace", async () => {
    await repository.save(
      WorkspaceMembership.create({
        workspaceId,
        actorType: "HUMAN",
        actorId: "user-1",
        role: WorkspaceRole.OWNER,
      }),
    );
    await repository.save(
      WorkspaceMembership.create({
        workspaceId,
        actorType: "AGENT",
        actorId: "agent-1",
        role: WorkspaceRole.AGENT_CONTRIBUTOR,
      }),
    );

    const memberships = await repository.listByWorkspace(workspaceId);

    expect(memberships).toHaveLength(2);
  });

  it("updates the role on save when the membership already exists", async () => {
    const membership = WorkspaceMembership.create({
      workspaceId,
      actorType: "AGENT",
      actorId: "agent-1",
      role: WorkspaceRole.AGENT_CONTRIBUTOR,
    });
    await repository.save(membership);

    membership.changeRole(WorkspaceRole.AGENT_MANAGER);
    await repository.save(membership);

    const found = await repository.findByActor(workspaceId, "AGENT", "agent-1");
    expect(found?.role).toBe(WorkspaceRole.AGENT_MANAGER);
    await expect(repository.listByWorkspace(workspaceId)).resolves.toHaveLength(1);
  });

  it("lists every workspace a given actor belongs to", async () => {
    const otherWorkspace = await prisma.workspace.create({ data: { name: "Other workspace" } });
    await repository.save(
      WorkspaceMembership.create({
        workspaceId,
        actorType: "HUMAN",
        actorId: "user-1",
        role: WorkspaceRole.OWNER,
      }),
    );
    await repository.save(
      WorkspaceMembership.create({
        workspaceId: otherWorkspace.id,
        actorType: "HUMAN",
        actorId: "user-1",
        role: WorkspaceRole.VIEWER,
      }),
    );
    await repository.save(
      WorkspaceMembership.create({
        workspaceId,
        actorType: "HUMAN",
        actorId: "someone-else",
        role: WorkspaceRole.OWNER,
      }),
    );

    const memberships = await repository.listByActor("HUMAN", "user-1");

    expect(memberships.map((m) => m.workspaceId).sort()).toEqual(
      [workspaceId, otherWorkspace.id].sort(),
    );
  });
});
