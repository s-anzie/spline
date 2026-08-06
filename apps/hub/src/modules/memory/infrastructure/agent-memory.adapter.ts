import { Global, Injectable, Module } from "@nestjs/common";

import {
  AGENT_MEMORY,
  AgentMemory,
  AgentMemoryQuery,
} from "../../runtime/domain/ports/agent-memory.port";
import { MemoryNote } from "../../runtime/domain/agent-prompt";
import { ReadContextUseCase } from "../application/memory.use-cases";
import { MemoryModule } from "../memory.module";

/**
 * How many notes a prompt is allowed to carry.
 *
 * The context builder already caps each scope at 25, and a workspace with
 * four populated scopes would therefore be able to put a hundred paragraphs
 * in front of a model — paid for on every single attempt. Thirty is a
 * budget, not a judgement about which notes matter: they arrive most general
 * first, so the cut falls on the most specific, and §17.8 says a cut is
 * announced rather than hidden.
 */
const MAX_NOTES = 30;

/**
 * §16 — supplies the context runtime asks for.
 *
 * Only this module knows what "current" means for an entry, how scopes are
 * ordered, and what supersedes what. Runtime receives the result already
 * decided, as flat notes.
 */
@Injectable()
export class AgentMemoryAdapter implements AgentMemory {
  constructor(private readonly readContext: ReadContextUseCase) {}

  async notesFor(query: AgentMemoryQuery): Promise<readonly MemoryNote[]> {
    const context = await this.readContext.execute({
      workspaceId: query.workspaceId,
      ...(query.goalId ? { goalId: query.goalId } : {}),
      taskId: query.taskId,
    });
    if (context.isFailure) {
      // A prompt without memory is worse than one with it, and far better
      // than no prompt at all: dispatch is not blocked by a context read.
      return [];
    }

    const notes: MemoryNote[] = [];
    for (const level of context.value.levels) {
      for (const entry of level.entries) {
        notes.push({
          scope: level.scopeType,
          title: entry.title,
          // An entry may be a pointer with no body of its own (§16 keeps
          // references, never copies). The title is still the convention.
          content: entry.content ?? "(recorded as a pointer; no text of its own)",
        });
      }
      if (level.truncated) {
        notes.push({
          scope: level.scopeType,
          title: "(more notes exist at this level)",
          content: `${level.total} in total; the oldest ${level.entries.length} are shown.`,
        });
      }
    }

    if (notes.length <= MAX_NOTES) {
      return notes;
    }
    return [
      ...notes.slice(0, MAX_NOTES),
      {
        scope: "WORKSPACE",
        title: "(this list was cut)",
        content:
          `${notes.length} notes applied here; the ${MAX_NOTES} most general ` +
          `are shown. Ask the hub for the rest if a decision depends on them.`,
      },
    ];
  }
}

/**
 * Global, and importing MemoryModule: the adapter depends on a provider that
 * module owns, and a provider module that does not import the module its
 * adapter needs resolves to nothing at runtime — the trap recorded in the
 * kernel doc.
 */
@Global()
@Module({
  imports: [MemoryModule],
  providers: [
    AgentMemoryAdapter,
    { provide: AGENT_MEMORY, useExisting: AgentMemoryAdapter },
  ],
  exports: [AGENT_MEMORY],
})
export class AgentMemoryModule {}
