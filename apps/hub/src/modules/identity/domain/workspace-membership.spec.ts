import { ActorRef } from "./actor";
import { WorkspaceMembership } from "./workspace-membership";

const now = new Date("2026-08-04T10:00:00.000Z");
const human = ActorRef.create("HUMAN", "u-1").value;
const agent = ActorRef.create("AGENT", "a-1").value;

describe("WorkspaceMembership", () => {
  it("grants a compatible role and raises identity.membership_granted", () => {
    const result = WorkspaceMembership.create({
      actor: human,
      workspaceId: "w-1",
      role: "OWNER",
      now,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.role).toBe("OWNER");
    expect(result.value.domainEvents[0]?.eventName).toBe("identity.membership_granted");
  });

  describe("role/actor compatibility", () => {
    it("humans take human roles, agents take agent roles", () => {
      expect(
        WorkspaceMembership.create({ actor: human, workspaceId: "w", role: "HUMAN_OPERATOR", now })
          .isSuccess,
      ).toBe(true);
      expect(
        WorkspaceMembership.create({ actor: agent, workspaceId: "w", role: "AGENT_MANAGER", now })
          .isSuccess,
      ).toBe(true);
    });

    it("rejects an agent role for a human and vice versa", () => {
      const humanAsManager = WorkspaceMembership.create({
        actor: human,
        workspaceId: "w",
        role: "AGENT_MANAGER",
        now,
      });
      const agentAsOwner = WorkspaceMembership.create({
        actor: agent,
        workspaceId: "w",
        role: "OWNER",
        now,
      });

      expect(humanAsManager.isFailure).toBe(true);
      expect(humanAsManager.error.name).toBe("IncompatibleRoleError");
      expect(agentAsOwner.isFailure).toBe(true);
    });

    it("workers hold no workspace role — their authority is machine-scoped", () => {
      const worker = ActorRef.create("WORKER", "m-1").value;

      const result = WorkspaceMembership.create({
        actor: worker,
        workspaceId: "w",
        role: "VIEWER",
        now,
      });

      expect(result.isFailure).toBe(true);
    });
  });

  describe("changeRole", () => {
    it("changing to the current role is an idempotent no-op without event", () => {
      const membership = WorkspaceMembership.create({
        actor: human,
        workspaceId: "w",
        role: "OWNER",
        now,
      }).value;
      membership.clearDomainEvents();

      const result = membership.changeRole("OWNER", now);

      expect(result.isSuccess).toBe(true);
      expect(membership.domainEvents).toHaveLength(0);
    });

    it("changing to a compatible role mutates and raises an event", () => {
      const membership = WorkspaceMembership.create({
        actor: human,
        workspaceId: "w",
        role: "OWNER",
        now,
      }).value;
      membership.clearDomainEvents();

      const result = membership.changeRole("HUMAN_OPERATOR", now);

      expect(result.isSuccess).toBe(true);
      expect(membership.role).toBe("HUMAN_OPERATOR");
      expect(membership.domainEvents[0]?.eventName).toBe(
        "identity.membership_role_changed",
      );
    });

    it("rejects an incompatible role on change too", () => {
      const membership = WorkspaceMembership.create({
        actor: agent,
        workspaceId: "w",
        role: "AGENT_CONTRIBUTOR",
        now,
      }).value;

      expect(membership.changeRole("OWNER", now).isFailure).toBe(true);
    });
  });

  it("revoke raises identity.membership_revoked once, idempotently", () => {
    const membership = WorkspaceMembership.create({
      actor: human,
      workspaceId: "w",
      role: "VIEWER",
      now,
    }).value;
    membership.clearDomainEvents();

    membership.revoke(now);
    membership.revoke(now);

    expect(membership.domainEvents).toHaveLength(1);
    expect(membership.domainEvents[0]?.eventName).toBe("identity.membership_revoked");
  });
});
