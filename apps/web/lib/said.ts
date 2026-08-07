/**
 * §14 — what a fact says, rather than what it is called.
 *
 * The journal records `runtime.command_enqueued`, `identity.task_grant_issued`,
 * `execution.run_started`. Those are addresses in this codebase, and they were
 * printed straight onto the Activity screen — so the record of what a team did
 * all night read like a debug log, and an operator scanning it had to
 * translate every line in their head.
 *
 * The mapping is written out rather than derived, and that is deliberate: a
 * rule that turned underscores into spaces would give "runtime command
 * enqueued", which is the same jargon with gaps in it. What a person wants is
 * the sentence.
 *
 * A name with no entry falls back to its readable form. That is not a gap to
 * close eagerly: a fact nobody has phrased yet still reads better spaced than
 * hidden, and inventing a sentence for an event this file has never seen is
 * how a screen ends up lying about what happened.
 */
import { humanise } from "./format";

const SAID: Record<string, string> = {
  // The work
  "goal.created": "a goal was stated",
  "goal.status_changed": "a goal changed state",
  "goal.completed": "a goal was reached",
  "task.created": "a task was cut",
  "task.assigned": "a task was handed over",
  "task.status_changed": "a task changed state",
  "task.completed": "a task was finished",
  "task.blocked": "a task was blocked",
  "task.unblocked": "a blocker was cleared",

  // What actually ran
  "execution.run_started": "a run started",
  "execution.run_finished": "a run ended",
  "runtime.command_enqueued": "an order was queued",
  "runtime.command_claimed": "a machine took an order",
  "runtime.command_finished": "a machine reported back",
  "runtime.session_started": "an agent started working",
  "runtime.session_ended": "an agent stopped",
  "runtime.session_crashed": "an agent's session died",
  "runtime.worker_registered": "a machine announced itself",
  "runtime.worker_attached": "a machine was lent to this workspace",
  "runtime.worker_handed_over": "a machine changed hands",
  "runtime.provider_unavailable": "a provider became unavailable",
  "runtime.provider_restored": "a provider came back",

  // Coordination
  "lock.acquired": "a claim was taken",
  "lock.released": "a claim was released",
  "lock.expired": "a claim expired",
  "validation.requested": "proof was asked for",
  "validation.settled": "proof was decided",
  "decision.recorded": "a decision was recorded",
  "agent.progress": "an agent said what it was doing",

  // Who may do what
  "identity.task_grant_issued": "an agent was given its credential",
  "identity.credential_revoked": "a credential was revoked",

  // People
  "notification.sent": "somebody was told",
  "notification.addressed": "somebody was named on a message",
  "conversation.thread_opened": "a conversation was opened",
  "conversation.turn_taken": "somebody spoke in a conversation",

  // The project
  "repository.created": "a project was registered",
  "repository.branch_opened": "a branch was opened",
  "repository.merge_decided": "a merge was decided",
  "workspace.created": "a workspace was created",
  "memory.noted": "something was written down",
};

export function said(type: string): string {
  return SAID[type] ?? humanise(type.replace(/\./g, " "));
}
