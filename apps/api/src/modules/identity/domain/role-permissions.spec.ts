import { WorkspaceRole } from "@repo/db";

import { PERMISSIONS } from "./permission";
import { roleHasPermission } from "./role-permissions";

describe("roleHasPermission", () => {
  it("grants the Owner every permission", () => {
    for (const permission of PERMISSIONS) {
      expect(roleHasPermission(WorkspaceRole.OWNER, permission)).toBe(true);
    }
  });

  it("never lets a Viewer create tasks or manage workspace rules", () => {
    expect(roleHasPermission(WorkspaceRole.VIEWER, "create_task")).toBe(false);
    expect(roleHasPermission(WorkspaceRole.VIEWER, "manage_workspace_rules")).toBe(false);
    expect(roleHasPermission(WorkspaceRole.VIEWER, "read_tasks")).toBe(true);
  });

  it("never lets a Read-only agent write anything", () => {
    for (const permission of PERMISSIONS) {
      if (permission === "read_tasks") {
        continue;
      }
      expect(roleHasPermission(WorkspaceRole.READ_ONLY_AGENT, permission)).toBe(false);
    }
  });

  it("only lets the Owner manage workspace rules", () => {
    const rolesAllowed = Object.values(WorkspaceRole).filter((role) =>
      roleHasPermission(role, "manage_workspace_rules"),
    );

    expect(rolesAllowed).toEqual([WorkspaceRole.OWNER]);
  });

  it("lets an Agent contributor start and stop processes but not validate decisions", () => {
    expect(roleHasPermission(WorkspaceRole.AGENT_CONTRIBUTOR, "start_process")).toBe(true);
    expect(roleHasPermission(WorkspaceRole.AGENT_CONTRIBUTOR, "stop_process")).toBe(true);
    expect(roleHasPermission(WorkspaceRole.AGENT_CONTRIBUTOR, "validate_decision")).toBe(false);
  });

  it("lets the Human operator validate decisions but not manage workspace rules", () => {
    expect(roleHasPermission(WorkspaceRole.HUMAN_OPERATOR, "validate_decision")).toBe(true);
    expect(roleHasPermission(WorkspaceRole.HUMAN_OPERATOR, "manage_workspace_rules")).toBe(false);
  });
});
