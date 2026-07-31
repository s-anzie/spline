/** The 8 fine-grained permissions from spec section 6. */
export const PERMISSIONS = [
  "read_tasks",
  "create_task",
  "acquire_lock",
  "start_process",
  "stop_process",
  "validate_decision",
  "manage_workspace_rules",
  "invite_agent",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
