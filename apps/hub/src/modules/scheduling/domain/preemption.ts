import { DomainError } from "../../../kernel/domain/domain-error";
import { comparePriority, Priority } from "../../../kernel/domain/priority";
import { Result } from "../../../kernel/domain/result";

/** One running task, and everything §9.14 needs to know about it. */
export interface PreemptionCandidate {
  taskId: string;
  runId: string;
  priority: Priority;
  /** When its current run began — how much work interrupting it would lose. */
  startedAt: Date;
  /**
   * §9.14's "la reprise possible". Answered by the execution module, which
   * knows whether the last attempt can be picked up again (§4.8, 0.3.11).
   */
  resumable: boolean;
  /** §9.14's "le Lease est récupérable". Answered by the lock module. */
  lockReclaimable: boolean;
}

/**
 * §20.6 — the refusal names every task it looked at and why each was left
 * alone. "Nothing could be preempted" would send an operator to inspect three
 * tasks without saying which condition failed on which.
 */
export class NoPreemptableTaskError extends DomainError {
  constructor(reasons: readonly string[]) {
    super(
      reasons.length === 0
        ? "Nothing is running that could be interrupted"
        : `No running task could be interrupted: ${reasons.join("; ")}`,
    );
  }
}

function ineligibility(
  claimant: Priority,
  candidate: PreemptionCandidate,
): string | null {
  // A negative comparison means the candidate is MORE urgent (the vocabulary
  // is ordered most-urgent first).
  if (comparePriority(candidate.priority, claimant) <= 0) {
    return `${candidate.taskId} is ${candidate.priority}, not lower than ${claimant}`;
  }
  if (!candidate.resumable) {
    return `${candidate.taskId} could not be resumed afterwards`;
  }
  if (!candidate.lockReclaimable) {
    return `${candidate.taskId} holds a lease that cannot be reclaimed`;
  }
  return null;
}

/**
 * §9.14 — which running task, if any, a more urgent one may interrupt.
 *
 * A **written precedence, replayable**, never a weighted score (§10.18d, the
 * lesson taken from OpenClaw's routing): the same inputs always give the same
 * answer, and an operator asking "why that one" can follow the rules rather
 * than trust a number.
 *
 * Eligibility first, precedence second. A task that cannot be interrupted
 * never wins on ordering, however far down the list it sits:
 *
 * 1. strictly lower priority — equal never preempts, or two CRITICAL tasks
 *    would take turns stopping each other and neither would finish
 * 2. resumable afterwards — otherwise this is destruction, not preemption
 * 3. its lease can be reclaimed
 *
 * Then, among those that qualify:
 *
 * 4. least urgent first
 * 5. most recently started — the least work invested, so the least lost
 * 6. by id, so a tie is decided the same way on a replay
 */
export function choosePreemptionVictim(
  claimant: Priority,
  candidates: readonly PreemptionCandidate[],
): Result<PreemptionCandidate, NoPreemptableTaskError> {
  const reasons: string[] = [];
  const eligible: PreemptionCandidate[] = [];

  for (const candidate of candidates) {
    const reason = ineligibility(claimant, candidate);
    if (reason === null) {
      eligible.push(candidate);
    } else {
      reasons.push(reason);
    }
  }

  if (eligible.length === 0) {
    return Result.fail(new NoPreemptableTaskError(reasons));
  }

  const ordered = [...eligible].sort(
    (left, right) =>
      // Least urgent first: reverse of the most-urgent-first comparator.
      comparePriority(right.priority, left.priority) ||
      right.startedAt.getTime() - left.startedAt.getTime() ||
      left.taskId.localeCompare(right.taskId),
  );
  return Result.ok(ordered[0] as PreemptionCandidate);
}
