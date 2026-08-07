import { ActorRef } from "../../../identity/domain/actor";

/**
 * Whose task this is.
 *
 * A contract about TASKS, and it lives with tasks. It was declared in
 * runtime's ports because that is where it was first needed (§18.10 — an
 * order borrows the authority of the task's assignee, read from the task and
 * never named by the machine, or a worker could borrow anyone's). A second
 * consumer arrived — §10.9's rule that an agent never pronounces on its own
 * work — and a contract two modules need has no business living inside one of
 * them.
 *
 * The old token is kept as an alias so nothing has to move at once.
 */
export interface TaskAssignee {
  assigneeOf(workspaceId: string, taskId: string): Promise<ActorRef | null>;
}

export const TASK_ASSIGNEE = "task/TaskAssignee";
