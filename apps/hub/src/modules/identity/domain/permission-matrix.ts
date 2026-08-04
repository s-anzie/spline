/**
 * RBAC catalog (§18.3): six workspace roles, fourteen permissions.
 * The matrix is data, not code — every row is unit-tested, and the
 * structural invariant "no agent role ever holds approve_validation"
 * (§10.9, §11) is asserted as its own test.
 */
export const WORKSPACE_ROLES = [
  "OWNER",
  "HUMAN_OPERATOR",
  "AGENT_MANAGER",
  "AGENT_CONTRIBUTOR",
  "READ_ONLY_AGENT",
  "VIEWER",
] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const PERMISSIONS = [
  "read_workspace_state",
  "manage_goals",
  "manage_tasks",
  "execute_tasks",
  "acquire_locks",
  "manage_processes",
  "request_validation",
  "approve_validation",
  "record_decisions",
  /**
   * Writing a memory note, sending a message: contributing knowledge and
   * communication without changing the state of any work. Separate from
   * `read_workspace_state` because a VIEWER and a READ_ONLY_AGENT are named
   * for reading and were able to write — a least-privilege violation (§18.1)
   * a matrix test could not see, since the mistake was on the routes.
   *
   * Granted wherever `record_decisions` is: recording one's reasoning,
   * noting what one learned and reporting it are the same category of act.
   * Withheld from VIEWER, which is the only role that observes without
   * participating.
   */
  "contribute_knowledge",
  "manage_workspace",
  "operate_workspace",
  "manage_members",
  "manage_machines",
  "manage_extensions",
  "manage_providers",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<WorkspaceRole, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  HUMAN_OPERATOR: [
    "read_workspace_state",
    "manage_goals",
    "manage_tasks",
    "execute_tasks",
    "acquire_locks",
    "manage_processes",
    "request_validation",
    "approve_validation",
    "record_decisions",
    "contribute_knowledge",
    "operate_workspace",
    "manage_machines",
    "manage_providers",
  ],
  AGENT_MANAGER: [
    "read_workspace_state",
    "manage_goals",
    "manage_tasks",
    "execute_tasks",
    "acquire_locks",
    "manage_processes",
    "request_validation",
    "record_decisions",
    "contribute_knowledge",
  ],
  AGENT_CONTRIBUTOR: [
    "read_workspace_state",
    "execute_tasks",
    "acquire_locks",
    "manage_processes",
    "request_validation",
    "record_decisions",
    "contribute_knowledge",
  ],
  READ_ONLY_AGENT: [
    "read_workspace_state",
    "record_decisions",
    "contribute_knowledge",
  ],
  VIEWER: ["read_workspace_state"],
};

export function roleHasPermission(role: WorkspaceRole, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}
