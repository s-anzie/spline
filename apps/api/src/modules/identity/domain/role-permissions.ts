import { WorkspaceRole } from "@repo/db";

import { Permission, PERMISSIONS } from "./permission";

/**
 * Spec section 6 defines a single role model shared by humans (Owner, Human
 * operator, Viewer) and agents (Agent manager, Agent contributor, Read-only
 * agent). This matrix is the one place that maps a role to what it can do.
 */
const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly Permission[]> = {
  [WorkspaceRole.OWNER]: PERMISSIONS,
  [WorkspaceRole.HUMAN_OPERATOR]: [
    "read_tasks",
    "create_task",
    "acquire_lock",
    "start_process",
    "stop_process",
    "validate_decision",
    "invite_agent",
  ],
  [WorkspaceRole.AGENT_MANAGER]: ["read_tasks", "create_task", "acquire_lock", "invite_agent"],
  [WorkspaceRole.AGENT_CONTRIBUTOR]: [
    "read_tasks",
    "create_task",
    "acquire_lock",
    "start_process",
    "stop_process",
  ],
  [WorkspaceRole.READ_ONLY_AGENT]: ["read_tasks"],
  [WorkspaceRole.VIEWER]: ["read_tasks"],
};

export function roleHasPermission(role: WorkspaceRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
