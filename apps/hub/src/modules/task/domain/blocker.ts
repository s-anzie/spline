import { ActorRef } from "../../identity/domain/actor";

/** §4.22 — an obstacle. A blocked task makes no progress. */
export const BLOCKER_TYPES = [
  "TECHNICAL",
  "DEPENDENCY",
  "APPROVAL",
  "INFRASTRUCTURE",
  "HUMAN",
  "EXTERNAL",
] as const;
export type BlockerType = (typeof BLOCKER_TYPES)[number];

/**
 * Lives inside the Task aggregate: a blocker has no life of its own, and
 * opening or closing one changes the task's state.
 */
export interface Blocker {
  id: string;
  type: BlockerType;
  description: string;
  reportedBy: ActorRef;
  reportedAt: Date;
  resolvedAt: Date | null;
  resolution: string | null;
}

export interface ReportBlockerInput {
  type: BlockerType;
  description: string;
  reportedBy: ActorRef;
}
