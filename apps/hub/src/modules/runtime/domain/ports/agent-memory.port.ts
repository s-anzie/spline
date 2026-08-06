import { MemoryNote } from "../agent-prompt";

export interface AgentMemoryQuery {
  workspaceId: string;
  /** Null when the task's goal could not be resolved; the scope is skipped. */
  goalId: string | null;
  taskId: string;
}

/**
 * §16 — what this workspace has already learned, for the agent about to work.
 *
 * Declared here and supplied by `memory`, per the inversion rule this
 * codebase follows everywhere: runtime knows an agent needs context, and
 * knows nothing about how memory is scoped, superseded or ranked.
 *
 * Returning notes rather than entries is deliberate. A `MemoryEntry` carries
 * an author, a supersession chain and a source pointer, none of which belong
 * in a prompt — and passing the whole aggregate would invite the prompt to
 * start making judgements that are the memory module's to make.
 */
export interface AgentMemory {
  notesFor(query: AgentMemoryQuery): Promise<readonly MemoryNote[]>;
}

export const AGENT_MEMORY = "runtime/AgentMemory";
