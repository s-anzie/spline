import { PrismaClient } from "@repo/db";

import { ActorRef } from "../../src/modules/identity/domain/actor";
import { WorkspaceMembership } from "../../src/modules/identity/domain/workspace-membership";
import { PrismaWorkspaceMembershipRepository } from "../../src/modules/identity/infrastructure/prisma-identity.repositories";
import { Workspace } from "../../src/modules/workspace/domain/workspace";
import { PrismaWorkspaceRepository } from "../../src/modules/workspace/infrastructure/prisma-workspace.repository";
import { PrismaService } from "../../src/prisma/prisma.service";
import { resetDatabase } from "../setup/reset-database";
import { createTestPrismaClient } from "./create-test-prisma-service";

const now = new Date("2026-08-04T10:00:00.000Z");
const later = new Date("2026-08-04T11:00:00.000Z");

describe("workspace repository (integration)", () => {
  let prisma: PrismaClient;
  let workspaces: PrismaWorkspaceRepository;
  let memberships: PrismaWorkspaceMembershipRepository;

  beforeAll(() => {
    prisma = createTestPrismaClient();
    const service = prisma as unknown as PrismaService;
    workspaces = new PrismaWorkspaceRepository(service);
    memberships = new PrismaWorkspaceMembershipRepository(service);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await prisma.organization.create({
      data: { id: "org-1", name: "Org", slug: "org", ownerId: "u-1" },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function makeWorkspace() {
    return Workspace.create({
      organizationId: "org-1",
      name: "Spline Core",
      settings: { rootPath: "/srv/x" },
      now,
    }).value;
  }

  it("round-trips the full aggregate including settings JSON", async () => {
    const workspace = makeWorkspace();

    await workspaces.save(workspace);

    const reloaded = await workspaces.findById(workspace.id.value);
    expect(reloaded?.slug).toBe("spline-core");
    expect(reloaded?.settings["rootPath"]).toBe("/srv/x");
    expect(reloaded?.status).toBe("ACTIVE");
  });

  it("persists the FULL aggregate on update — status and settings survive reload (§5.19)", async () => {
    const workspace = makeWorkspace();
    await workspaces.save(workspace);

    workspace.updateDetails({ name: "Renamed", settings: { extra: 1 } }, later);
    workspace.changeStatus("PAUSED", later);
    await workspaces.save(workspace);

    const reloaded = await workspaces.findById(workspace.id.value);
    expect(reloaded?.name).toBe("Renamed");
    expect(reloaded?.slug).toBe("renamed");
    expect(reloaded?.settings["extra"]).toBe(1);
    expect(reloaded?.status).toBe("PAUSED");
    expect(reloaded?.updatedAt).toEqual(later);
  });

  it("listByIds preserves only existing workspaces", async () => {
    const workspace = makeWorkspace();
    await workspaces.save(workspace);

    const listed = await workspaces.listByIds([workspace.id.value, "ghost"]);

    expect(listed).toHaveLength(1);
  });

  it("physical delete cascades to memberships (compensation path)", async () => {
    const workspace = makeWorkspace();
    await workspaces.save(workspace);
    const membership = WorkspaceMembership.create({
      actor: ActorRef.create("HUMAN", "u-1").value,
      workspaceId: workspace.id.value,
      role: "OWNER",
      now,
    }).value;
    await memberships.save(membership);

    await workspaces.delete(workspace.id.value);

    expect(await memberships.findById(membership.id.value)).toBeNull();
  });

  it("rejects a membership pointing at a non-existent workspace (FK integrity)", async () => {
    const membership = WorkspaceMembership.create({
      actor: ActorRef.create("HUMAN", "u-1").value,
      workspaceId: "ghost",
      role: "OWNER",
      now,
    }).value;

    await expect(memberships.save(membership)).rejects.toThrow();
  });
});
