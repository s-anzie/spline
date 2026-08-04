import { PrismaClient } from "@repo/db";

import { ActorRef } from "../../src/modules/identity/domain/actor";
import { ActorCredential } from "../../src/modules/identity/domain/actor-credential";
import { Email } from "../../src/modules/identity/domain/email";
import { Organization } from "../../src/modules/identity/domain/organization";
import { User } from "../../src/modules/identity/domain/user";
import { WorkspaceMembership } from "../../src/modules/identity/domain/workspace-membership";
import {
  PrismaActorCredentialRepository,
  PrismaOrganizationRepository,
  PrismaUserRepository,
  PrismaWorkspaceMembershipRepository,
} from "../../src/modules/identity/infrastructure/prisma-identity.repositories";
import { PrismaService } from "../../src/prisma/prisma.service";
import { resetDatabase } from "../setup/reset-database";
import { createTestPrismaClient } from "./create-test-prisma-service";

const now = new Date("2026-08-04T10:00:00.000Z");
const later = new Date("2026-08-04T11:00:00.000Z");

describe("identity repositories (integration)", () => {
  let prisma: PrismaClient;
  let users: PrismaUserRepository;
  let organizations: PrismaOrganizationRepository;
  let memberships: PrismaWorkspaceMembershipRepository;
  let credentials: PrismaActorCredentialRepository;

  beforeAll(() => {
    prisma = createTestPrismaClient();
    const service = prisma as unknown as PrismaService;
    users = new PrismaUserRepository(service);
    organizations = new PrismaOrganizationRepository(service);
    memberships = new PrismaWorkspaceMembershipRepository(service);
    credentials = new PrismaActorCredentialRepository(service);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    // Memberships now carry a real FK to workspaces (workspace module's
    // migration) — the rows the membership tests reference must exist.
    await prisma.organization.create({
      data: { id: "org-1", name: "Org", slug: "org", ownerId: "fixture-owner" },
    });
    await prisma.workspace.create({
      data: {
        id: "w-1",
        organizationId: "org-1",
        name: "W",
        slug: "w",
        updatedAt: now,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("round-trips a user and finds it by normalized email", async () => {
    const user = User.create({
      email: Email.create("Bradley@Example.com").value,
      passwordHash: "$2b$10$h",
      displayName: "Bradley",
      now,
    }).value;

    await users.save(user);

    const reloaded = await users.findByEmail("bradley@example.com");
    expect(reloaded?.id.value).toBe(user.id.value);
    expect(reloaded?.displayName).toBe("Bradley");
    expect(reloaded?.createdAt).toEqual(now);
  });

  it("round-trips an organization and lists by owner", async () => {
    const organization = Organization.create({
      name: "Bradley's Space",
      ownerId: "u-1",
      now,
    }).value;

    await organizations.save(organization);

    const listed = await organizations.listByOwnerId("u-1");
    expect(listed).toHaveLength(1);
    expect(listed[0]?.slug).toBe("bradley-s-space");
  });

  it("enforces one membership per (actor, workspace) at the database level", async () => {
    const actor = ActorRef.create("HUMAN", "u-1").value;
    const first = WorkspaceMembership.create({
      actor,
      workspaceId: "w-1",
      role: "OWNER",
      now,
    }).value;
    const duplicate = WorkspaceMembership.create({
      actor,
      workspaceId: "w-1",
      role: "VIEWER",
      now,
    }).value;
    await memberships.save(first);

    await expect(memberships.save(duplicate)).rejects.toThrow();
  });

  it("persists the FULL aggregate on update — a role change survives reload (§5.19)", async () => {
    const actor = ActorRef.create("HUMAN", "u-1").value;
    const membership = WorkspaceMembership.create({
      actor,
      workspaceId: "w-1",
      role: "OWNER",
      now,
    }).value;
    await memberships.save(membership);

    membership.changeRole("HUMAN_OPERATOR", later);
    await memberships.save(membership);

    const reloaded = await memberships.findById(membership.id.value);
    expect(reloaded?.role).toBe("HUMAN_OPERATOR");
  });

  it("queries memberships by actor, workspace and role count", async () => {
    const owner = ActorRef.create("HUMAN", "u-1").value;
    const agent = ActorRef.create("AGENT", "a-1").value;
    await memberships.save(
      WorkspaceMembership.create({ actor: owner, workspaceId: "w-1", role: "OWNER", now })
        .value,
    );
    await memberships.save(
      WorkspaceMembership.create({
        actor: agent,
        workspaceId: "w-1",
        role: "AGENT_CONTRIBUTOR",
        now,
      }).value,
    );

    expect(await memberships.countByWorkspaceAndRole("w-1", "OWNER")).toBe(1);
    expect(await memberships.listByWorkspace("w-1")).toHaveLength(2);
    expect(await memberships.listByActor(agent)).toHaveLength(1);
    const found = await memberships.findByActorAndWorkspace(owner, "w-1");
    expect(found?.role).toBe("OWNER");
  });

  it("deletes a membership", async () => {
    const actor = ActorRef.create("HUMAN", "u-1").value;
    const membership = WorkspaceMembership.create({
      actor,
      workspaceId: "w-1",
      role: "OWNER",
      now,
    }).value;
    await memberships.save(membership);

    await memberships.delete(membership.id.value);

    expect(await memberships.findById(membership.id.value)).toBeNull();
  });

  it("round-trips a credential and persists revocation + lastUsedAt on update", async () => {
    const actor = ActorRef.create("AGENT", "a-1").value;
    const credential = ActorCredential.create({ actor, tokenHash: "$2b$10$h", now }).value;
    await credentials.save(credential);

    credential.touch(later);
    credential.revoke(later);
    await credentials.save(credential);

    const reloaded = await credentials.findById(credential.id.value);
    expect(reloaded?.isRevoked).toBe(true);
    expect(reloaded?.revokedAt).toEqual(later);
    expect(reloaded?.lastUsedAt).toEqual(later);
    expect(await credentials.listByActor(actor)).toHaveLength(1);
  });
});
