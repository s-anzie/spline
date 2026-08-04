import { MemoryEntry, MemoryScopeType } from "./memory-entry";

export interface MemoryContext {
  organizationId?: string;
  workspaceId: string;
  repositoryId?: string;
  goalId?: string;
  taskId?: string;
  runId?: string;
  sessionId?: string;
}

export interface ContextLevel {
  scopeType: MemoryScopeType;
  scopeId: string;
  entries: MemoryEntry[];
  /** §17.8 — a silent cut would read as "that is all there is". */
  truncated: boolean;
  total: number;
}

export interface BuiltContext {
  levels: ContextLevel[];
}

/**
 * An agent loading its context must not be handed a thousand notes; the cap
 * is per level so a chatty workspace cannot crowd out the task at hand.
 */
export const PER_SCOPE_LIMIT = 25;

/**
 * §16.2, read from the general to the specific — the order someone would tell
 * it in: where we are, then what we are doing here.
 *
 * This is the OPPOSITE of policy resolution (§12.2), and reusing that code
 * would be a contresens: a task-level policy REPLACES the workspace's, a
 * task-level note is ADDED to it. Same-looking hierarchy, opposite semantics.
 */
const PRECEDENCE: readonly MemoryScopeType[] = [
  "ORGANIZATION",
  "WORKSPACE",
  "REPOSITORY",
  "GOAL",
  "TASK",
  "RUN",
  "SESSION",
];

function scopeIdFor(
  scopeType: MemoryScopeType,
  context: MemoryContext,
): string | undefined {
  switch (scopeType) {
    case "ORGANIZATION":
      return context.organizationId;
    case "WORKSPACE":
      return context.workspaceId;
    case "REPOSITORY":
      return context.repositoryId;
    case "GOAL":
      return context.goalId;
    case "TASK":
      return context.taskId;
    case "RUN":
      return context.runId;
    case "SESSION":
      return context.sessionId;
  }
}

export function buildContext(
  entries: readonly MemoryEntry[],
  context: MemoryContext,
): BuiltContext {
  const levels: ContextLevel[] = [];

  for (const scopeType of PRECEDENCE) {
    const scopeId = scopeIdFor(scopeType, context);
    if (scopeId === undefined) {
      continue;
    }
    const atThisLevel = entries
      .filter(
        (entry) =>
          entry.isCurrent && entry.scopeType === scopeType && entry.scopeId === scopeId,
      )
      // Oldest first: conventions before the corrections layered on them.
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    if (atThisLevel.length === 0) {
      continue;
    }
    levels.push({
      scopeType,
      scopeId,
      entries: atThisLevel.slice(0, PER_SCOPE_LIMIT),
      truncated: atThisLevel.length > PER_SCOPE_LIMIT,
      total: atThisLevel.length,
    });
  }

  return { levels };
}
