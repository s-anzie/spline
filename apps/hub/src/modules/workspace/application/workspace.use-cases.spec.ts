import { FakeClock } from "../../../kernel/testing/fake-clock";
import { FakeEventPublisher } from "../../../kernel/testing/fake-event-publisher";
import { GrantWorkspaceMembershipUseCase } from "../../identity/application/grant-workspace-membership.use-case";
import {
  InMemoryOrganizationRepository,
  InMemoryWorkspaceMembershipRepository,
} from "../../identity/application/testing/identity.doubles";
import { Organization } from "../../identity/domain/organization";
import { InMemoryWorkspaceRepository } from "./testing/workspace.doubles";
import { ChangeWorkspaceStatusUseCase } from "./change-workspace-status.use-case";
import { CreateWorkspaceUseCase } from "./create-workspace.use-case";
import { GetWorkspaceUseCase } from "./get-workspace.use-case";
import { ListWorkspacesForActorUseCase } from "./list-workspaces-for-actor.use-case";
import { UpdateWorkspaceDetailsUseCase } from "./update-workspace-details.use-case";

const now = new Date("2026-08-04T10:00:00.000Z");

async function makeContext() {
  const workspaces = new InMemoryWorkspaceRepository();
  const memberships = new InMemoryWorkspaceMembershipRepository();
  const organizations = new InMemoryOrganizationRepository();
  const clock = new FakeClock(now);
  const publisher = new FakeEventPublisher();
  const organization = Organization.create({ name: "Bradley Org", ownerId: "u-1", now }).value;
  await organizations.save(organization);
  const grantMembership = new GrantWorkspaceMembershipUseCase(memberships, clock, publisher);
  const create = new CreateWorkspaceUseCase(
    workspaces,
    organizations,
    grantMembership,
    clock,
    publisher,
  );
  const get = new GetWorkspaceUseCase(workspaces);
  const list = new ListWorkspacesForActorUseCase(workspaces, memberships);
  const update = new UpdateWorkspaceDetailsUseCase(workspaces, clock, publisher);
  const changeStatus = new ChangeWorkspaceStatusUseCase(workspaces, clock, publisher);
  return {
    workspaces,
    memberships,
    organizations,
    organization,
    publisher,
    create,
    get,
    list,
    update,
    changeStatus,
  };
}

describe("workspace use-cases", () => {
  describe("CreateWorkspaceUseCase", () => {
    it("creates the workspace and grants the creator the OWNER membership", async () => {
      const ctx = await makeContext();

      const result = await ctx.create.execute({
        organizationId: ctx.organization.id.value,
        name: "Spline Core",
        creatorUserId: "u-1",
      });

      expect(result.isSuccess).toBe(true);
      const membership = await ctx.memberships.listByWorkspace(result.value.workspaceId);
      expect(membership).toHaveLength(1);
      expect(membership[0]?.role).toBe("OWNER");
      expect(membership[0]?.actor.type).toBe("HUMAN");
      expect(membership[0]?.actor.actorId).toBe("u-1");
    });

    it("publishes workspace.created after persistence", async () => {
      const ctx = await makeContext();

      await ctx.create.execute({
        organizationId: ctx.organization.id.value,
        name: "Spline Core",
        creatorUserId: "u-1",
      });

      expect(ctx.publisher.published.map((e) => e.eventName)).toContain(
        "workspace.created",
      );
    });

    it("rejects an unknown organization", async () => {
      const ctx = await makeContext();

      const result = await ctx.create.execute({
        organizationId: "nope",
        name: "X",
        creatorUserId: "u-1",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("OrganizationNotFoundError");
    });

    it("rejects a creator who does not own the organization", async () => {
      const ctx = await makeContext();

      const result = await ctx.create.execute({
        organizationId: ctx.organization.id.value,
        name: "X",
        creatorUserId: "intruder",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("NotOrganizationOwnerError");
    });

    it("compensates: no orphan workspace survives a failed OWNER grant", async () => {
      const ctx = await makeContext();
      await ctx.create.execute({
        organizationId: ctx.organization.id.value,
        name: "First",
        creatorUserId: "u-1",
      });
      // Force the duplicate-membership failure path by pre-granting the same
      // actor in the future workspace id space is impossible — instead break
      // the membership store to simulate an infrastructure failure.
      ctx.memberships.save = async () => {
        throw new Error("db down");
      };

      await expect(
        ctx.create.execute({
          organizationId: ctx.organization.id.value,
          name: "Second",
          creatorUserId: "u-1",
        }),
      ).rejects.toThrow("db down");

      const all = [...ctx.workspaces.workspaces.values()].map((w) => w.name);
      expect(all).toEqual(["First"]);
    });
  });

  describe("GetWorkspaceUseCase", () => {
    it("returns the workspace by id", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute({
        organizationId: ctx.organization.id.value,
        name: "Spline Core",
        creatorUserId: "u-1",
      });

      const result = await ctx.get.execute({ workspaceId: created.value.workspaceId });

      expect(result.isSuccess).toBe(true);
      expect(result.value.slug).toBe("spline-core");
    });

    it("hides DELETED workspaces and unknown ids alike", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute({
        organizationId: ctx.organization.id.value,
        name: "Spline Core",
        creatorUserId: "u-1",
      });
      await ctx.changeStatus.execute({
        workspaceId: created.value.workspaceId,
        status: "ARCHIVED",
      });
      await ctx.changeStatus.execute({
        workspaceId: created.value.workspaceId,
        status: "DELETED",
      });

      const deleted = await ctx.get.execute({ workspaceId: created.value.workspaceId });
      const unknown = await ctx.get.execute({ workspaceId: "nope" });

      expect(deleted.isFailure).toBe(true);
      expect(deleted.error.name).toBe("WorkspaceNotFoundError");
      expect(unknown.isFailure).toBe(true);
    });
  });

  describe("ListWorkspacesForActorUseCase", () => {
    it("lists only the workspaces the actor belongs to, excluding DELETED", async () => {
      const ctx = await makeContext();
      const mine = await ctx.create.execute({
        organizationId: ctx.organization.id.value,
        name: "Mine",
        creatorUserId: "u-1",
      });
      const gone = await ctx.create.execute({
        organizationId: ctx.organization.id.value,
        name: "Gone",
        creatorUserId: "u-1",
      });
      await ctx.changeStatus.execute({ workspaceId: gone.value.workspaceId, status: "ARCHIVED" });
      await ctx.changeStatus.execute({ workspaceId: gone.value.workspaceId, status: "DELETED" });

      const result = await ctx.list.execute({ actorType: "HUMAN", actorId: "u-1" });

      expect(result.isSuccess).toBe(true);
      expect(result.value.map((w) => w.id.value)).toEqual([mine.value.workspaceId]);
    });

    it("returns an empty list for a stranger", async () => {
      const ctx = await makeContext();

      const result = await ctx.list.execute({ actorType: "HUMAN", actorId: "nobody" });

      expect(result.value).toEqual([]);
    });
  });

  describe("UpdateWorkspaceDetailsUseCase", () => {
    it("updates details and publishes workspace.updated", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute({
        organizationId: ctx.organization.id.value,
        name: "Spline Core",
        creatorUserId: "u-1",
      });

      const result = await ctx.update.execute({
        workspaceId: created.value.workspaceId,
        description: "The hub",
      });

      expect(result.isSuccess).toBe(true);
      const reloaded = await ctx.workspaces.findById(created.value.workspaceId);
      expect(reloaded?.description).toBe("The hub");
      expect(ctx.publisher.published.map((e) => e.eventName)).toContain(
        "workspace.updated",
      );
    });

    it("propagates domain failures (non-ACTIVE workspace)", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute({
        organizationId: ctx.organization.id.value,
        name: "Spline Core",
        creatorUserId: "u-1",
      });
      await ctx.changeStatus.execute({ workspaceId: created.value.workspaceId, status: "PAUSED" });

      const result = await ctx.update.execute({
        workspaceId: created.value.workspaceId,
        description: "x",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("WorkspaceNotActiveError");
    });
  });

  describe("ChangeWorkspaceStatusUseCase", () => {
    it("changes status and publishes workspace.status_changed", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute({
        organizationId: ctx.organization.id.value,
        name: "Spline Core",
        creatorUserId: "u-1",
      });

      const result = await ctx.changeStatus.execute({
        workspaceId: created.value.workspaceId,
        status: "PAUSED",
      });

      expect(result.isSuccess).toBe(true);
      expect(ctx.publisher.published.map((e) => e.eventName)).toContain(
        "workspace.status_changed",
      );
    });

    it("same-status is an idempotent success", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute({
        organizationId: ctx.organization.id.value,
        name: "Spline Core",
        creatorUserId: "u-1",
      });

      const result = await ctx.changeStatus.execute({
        workspaceId: created.value.workspaceId,
        status: "ACTIVE",
      });

      expect(result.isSuccess).toBe(true);
    });

    it("invalid transition surfaces the typed error", async () => {
      const ctx = await makeContext();
      const created = await ctx.create.execute({
        organizationId: ctx.organization.id.value,
        name: "Spline Core",
        creatorUserId: "u-1",
      });

      const result = await ctx.changeStatus.execute({
        workspaceId: created.value.workspaceId,
        status: "DELETED",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.name).toBe("InvalidStateTransitionError");
    });
  });
});
