import { ActorRef } from "./actor";
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
   * an addition here widens what every agent may do mid-task.
   */
  it("names exactly the permissions the protocol cycle needs", () => {
    expect([...PROTOCOL_SCOPES].sort()).toEqual(
      [
        "acquire_locks",
        "contribute_knowledge",
        "execute_tasks",
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
