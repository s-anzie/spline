import { PERMISSIONS, roleHasPermission, WORKSPACE_ROLES } from "./permission-matrix";

describe("permission matrix (§18.3)", () => {
  it("exposes the six workspace roles and sixteen permissions", () => {
    expect(WORKSPACE_ROLES).toHaveLength(6);
    expect(PERMISSIONS).toHaveLength(16);
  });

  it("OWNER holds every permission", () => {
    for (const permission of PERMISSIONS) {
      expect(roleHasPermission("OWNER", permission)).toBe(true);
    }
  });

  it("HUMAN_OPERATOR holds everything except workspace admin, members and extensions", () => {
    expect(roleHasPermission("HUMAN_OPERATOR", "approve_validation")).toBe(true);
    expect(roleHasPermission("HUMAN_OPERATOR", "manage_machines")).toBe(true);
    expect(roleHasPermission("HUMAN_OPERATOR", "manage_providers")).toBe(true);
    expect(roleHasPermission("HUMAN_OPERATOR", "manage_workspace")).toBe(false);
    expect(roleHasPermission("HUMAN_OPERATOR", "manage_members")).toBe(false);
    expect(roleHasPermission("HUMAN_OPERATOR", "manage_extensions")).toBe(false);
  });

  it("an operator can pause execution in an emergency, but never rename or archive", () => {
    // "pilote les agents, valide, arbitre" — freezing execution is piloting;
    // renaming and archiving are ownership-level acts.
    expect(roleHasPermission("HUMAN_OPERATOR", "operate_workspace")).toBe(true);
    expect(roleHasPermission("HUMAN_OPERATOR", "manage_workspace")).toBe(false);
  });

  it("no agent role can pause or administer a workspace", () => {
    for (const role of ["AGENT_MANAGER", "AGENT_CONTRIBUTOR", "READ_ONLY_AGENT"] as const) {
      expect(roleHasPermission(role, "operate_workspace")).toBe(false);
      expect(roleHasPermission(role, "manage_workspace")).toBe(false);
    }
  });

  it("AGENT_MANAGER can manage goals and tasks but never administers the workspace", () => {
    expect(roleHasPermission("AGENT_MANAGER", "manage_goals")).toBe(true);
    expect(roleHasPermission("AGENT_MANAGER", "manage_tasks")).toBe(true);
    expect(roleHasPermission("AGENT_MANAGER", "execute_tasks")).toBe(true);
    expect(roleHasPermission("AGENT_MANAGER", "manage_members")).toBe(false);
    expect(roleHasPermission("AGENT_MANAGER", "manage_workspace")).toBe(false);
    expect(roleHasPermission("AGENT_MANAGER", "manage_machines")).toBe(false);
    expect(roleHasPermission("AGENT_MANAGER", "manage_providers")).toBe(false);
  });

  it("AGENT_CONTRIBUTOR executes but does not manage tasks", () => {
    expect(roleHasPermission("AGENT_CONTRIBUTOR", "execute_tasks")).toBe(true);
    expect(roleHasPermission("AGENT_CONTRIBUTOR", "acquire_locks")).toBe(true);
    expect(roleHasPermission("AGENT_CONTRIBUTOR", "manage_tasks")).toBe(false);
    expect(roleHasPermission("AGENT_CONTRIBUTOR", "manage_goals")).toBe(false);
  });

  it("READ_ONLY_AGENT observes and reports, but changes no work", () => {
    expect(roleHasPermission("READ_ONLY_AGENT", "read_workspace_state")).toBe(true);
    expect(roleHasPermission("READ_ONLY_AGENT", "record_decisions")).toBe(true);
    // Noting what it learned and reporting it are the same category as
    // recording its reasoning: observing and saying so, without touching work.
    expect(roleHasPermission("READ_ONLY_AGENT", "contribute_knowledge")).toBe(true);
    expect(roleHasPermission("READ_ONLY_AGENT", "execute_tasks")).toBe(false);
    expect(roleHasPermission("READ_ONLY_AGENT", "acquire_locks")).toBe(false);
  });

  it("VIEWER only reads", () => {
    for (const permission of PERMISSIONS) {
      expect(roleHasPermission("VIEWER", permission)).toBe(
        permission === "read_workspace_state",
      );
    }
  });

  it("STRUCTURAL INVARIANT: no agent role can ever approve a validation (§10.9, §11)", () => {
    for (const role of ["AGENT_MANAGER", "AGENT_CONTRIBUTOR", "READ_ONLY_AGENT"] as const) {
      expect(roleHasPermission(role, "approve_validation")).toBe(false);
    }
  });

  it("every role can read its workspace", () => {
    for (const role of WORKSPACE_ROLES) {
      expect(roleHasPermission(role, "read_workspace_state")).toBe(true);
    }
  });
});
