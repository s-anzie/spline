import { ActorRef } from "./actor";
import { PERMISSIONS, roleHasPermission } from "./permission-matrix";
import { PROTOCOL_SCOPES, TaskGrant } from "./task-grant";

const now = new Date("2026-08-05T12:00:00.000Z");
const soon = new Date("2026-08-05T12:30:00.000Z");
const late = new Date("2026-08-05T14:00:00.000Z");
const agent = ActorRef.create("AGENT", "a-1").value;
const HOUR = 60 * 60 * 1000;

function issued(overrides: Record<string, unknown> = {}) {
  return TaskGrant.issue({
    workspaceId: "w-1",
    taskId: "t-1",
    actor: agent,
    scopes: ["read_workspace_state", "contribute_knowledge"],
    tokenHash: "$2b$10$hash",
    ttlMs: HOUR,
    now,
    ...overrides,
  });
}

describe("TaskGrant", () => {
  it("acts as the agent, never as the machine carrying it", () => {
    const grant = issued().value;

    expect(grant.actor.type).toBe("AGENT");
    expect(grant.actor.actorId).toBe("a-1");
  });

  it("expires, and says so at read", () => {
    const grant = issued().value;

    expect(grant.isUsableAt(soon)).toBe(true);
    expect(grant.isUsableAt(late)).toBe(false);
  });

  it("can be cut off before it expires", () => {
    const grant = issued().value;
    grant.revoke(soon);

    expect(grant.isUsableAt(soon)).toBe(false);
  });

  it("keeps the first revocation time, so a repeat changes nothing", () => {
    const grant = issued().value;
    grant.revoke(soon);
    grant.revoke(late);

    expect(grant.revokedAt).toEqual(soon);
  });

  /**
   * §18.10 — a grant restricts. Everything it allows must be inside its own
   * workspace, or a credential minted for one workspace would work in
   * another.
   */
  describe("what it permits", () => {
    it("allows a scope it carries, in its own workspace", () => {
      expect(issued().value.permits("read_workspace_state", "w-1")).toBe(true);
    });

    it("refuses a scope it does not carry", () => {
      expect(issued().value.permits("manage_members", "w-1")).toBe(false);
    });

    it("refuses even a carried scope in another workspace", () => {
      expect(issued().value.permits("read_workspace_state", "w-2")).toBe(false);
    });
  });

  describe("what it refuses to be", () => {
    /**
     * A credential that permits nothing is not a safe credential, it is a
     * confusing one: whoever holds it gets refusals with no explanation. The
     * caller is refused instead, where the reason is known.
     */
    it("refuses to exist with no scopes at all", () => {
      expect(issued({ scopes: [] }).isFailure).toBe(true);
    });

    it("refuses to exist without expiring", () => {
      expect(issued({ ttlMs: 0 }).isFailure).toBe(true);
      expect(issued({ ttlMs: -1 }).isFailure).toBe(true);
    });

    it("refuses to belong to no task", () => {
      expect(issued({ taskId: " " }).isFailure).toBe(true);
    });
  });

  /**
   * §10 — the protocol's own scopes. Stated as a test because the list is a
   * review decision: each line of §10.2's cycle maps to one permission, and
   * an addition here widens what an agent MAY BE LENT mid-task.
   *
   * `manage_goals` and `manage_tasks` were added for the manager, and the
   * reason they are safe is not that they are small — they are not. It is
   * that the grant is issued as the intersection of this list with the
   * actor's role, so a contributor asking for them receives neither. The test
   * below proves that side of it; this one is the gate on the list itself.
   */
  it("names exactly the permissions the protocol cycle needs", () => {
    expect([...PROTOCOL_SCOPES].sort()).toEqual(
      [
        "acquire_locks",
        /**
         * Reachable, granted to nobody by default: no agent role holds this
         * in the matrix, so the intersection is empty unless a workspace's
         * owner has deliberately lent it to the manager (§18.3). Leaving it
         * out would make that lending a switch with nothing behind it.
         */
        "approve_validation",
        "contribute_knowledge",
        "execute_tasks",
        "manage_goals",
        "manage_tasks",
        "read_workspace_state",
        "record_decisions",
        "request_validation",
      ].sort(),
    );
  });

  it("never includes a permission that manages the workspace itself", () => {
    for (const forbidden of ["manage_members", "manage_workspace", "manage_machines"]) {
      expect(PROTOCOL_SCOPES).not.toContain(forbidden);
    }
  });
});

/**
 * §10, §18.12 — what a MANAGER may be lent, and what a contributor may not.
 *
 * The whole autonomous-team idea rests on one thing already being true: the
 * leash is the intersection of what a grant asks for and what the actor's
 * role actually holds. So widening the askable set does not widen anybody's
 * powers — it lets a manager exercise the organising permissions its role
 * already carried and had no way to use, and it changes nothing at all for a
 * contributor.
 */
describe("PROTOCOL_SCOPES", () => {
  it("offers the organising permissions, so a manager can be lent them", () => {
    expect(PROTOCOL_SCOPES).toContain("manage_goals");
    expect(PROTOCOL_SCOPES).toContain("manage_tasks");
  });

  it("asks only for permissions that exist in the matrix", () => {
    for (const scope of PROTOCOL_SCOPES) {
      expect(PERMISSIONS).toContain(scope);
    }
  });

  /**
   * The two roles, side by side. A contributor asking for the same scopes
   * gets the same short list it always got — the filter is the leash, and it
   * is a property of the role rather than of the request.
   */
  it("hands a manager more than a contributor, from the same request", () => {
    const forManager = PROTOCOL_SCOPES.filter((scope) =>
      roleHasPermission("AGENT_MANAGER", scope),
    );
    const forContributor = PROTOCOL_SCOPES.filter((scope) =>
      roleHasPermission("AGENT_CONTRIBUTOR", scope),
    );

    expect(forManager).toContain("manage_tasks");
    expect(forManager).toContain("manage_goals");
    expect(forContributor).not.toContain("manage_tasks");
    expect(forContributor).not.toContain("manage_goals");
    // And a read-only agent still cannot even execute.
    expect(
      PROTOCOL_SCOPES.filter((scope) => roleHasPermission("READ_ONLY_AGENT", scope)),
    ).not.toContain("execute_tasks");
  });
});
