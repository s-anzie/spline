import { ActorRef } from "../../../identity/domain/actor";
import { MemoryEntry, MemoryScopeType } from "../memory-entry";

/** §16.9 — indexed by type, date, author, scope and tags. */
export interface SearchMemoryFilter {
  /** Mandatory (§4.2): there is no unscoped memory. */
  workspaceId: string;
  scopeType?: MemoryScopeType;
  scopeId?: string;
  type?: string;
  author?: ActorRef;
  tag?: string;
  includeSuperseded?: boolean;
  limit?: number;
}

export const DEFAULT_MEMORY_PAGE = 50;
export const MAX_MEMORY_PAGE = 200;

export interface MemoryRepository {
  save(entry: MemoryEntry): Promise<void>;
  findById(id: string): Promise<MemoryEntry | null>;
  /** A reference is posed once per source — reconstruction must be repeatable. */
  findReference(
    workspaceId: string,
    scopeType: MemoryScopeType,
    scopeId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<MemoryEntry | null>;
  search(filter: SearchMemoryFilter): Promise<MemoryEntry[]>;
  /** Everything current across the scopes of one context, for §16.2. */
  listForScopes(
    workspaceId: string,
    scopes: readonly { scopeType: MemoryScopeType; scopeId: string }[],
  ): Promise<MemoryEntry[]>;
}
export const MEMORY_REPOSITORY = "memory/MemoryRepository";
