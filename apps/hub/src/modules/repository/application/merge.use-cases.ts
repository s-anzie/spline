import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { GuardViolation } from "../../../kernel/domain/guard";
import { AUDIT_TRAIL, AuditTrail } from "../../../kernel/domain/ports/audit-trail.port";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import { TASK_PROOF, TaskProofPort } from "../../task/domain/ports/task-proof.port";
import { MergeRequest, unmetMergeConditions } from "../domain/merge-request";
import {
  BRANCH_STORE,
  BranchStore,
  MERGE_REQUEST_STORE,
  MergeRequestStore,
  REPOSITORY_STORE,
  RepositoryStore,
} from "../domain/ports/repository.repository.port";
import {
  BranchNotFoundError,
  MergeNotAllowedError,
  MergeRequestNotFoundError,
  RepositoryNotFoundError,
} from "../domain/repository.errors";

export interface RequestMergeInput {
  workspaceId: string;
  repositoryId: string;
  sourceBranchId: string;
  targetBranchId: string;
  taskId: string;
  actorType: ActorType;
  actorId: string;
}

export type RequestMergeError =
  | GuardViolation
  | RepositoryNotFoundError
  | BranchNotFoundError;

/** §8.5 — asking is ordinary work; deciding is not (§8.7). */
@Injectable()
export class RequestMergeUseCase
  implements
    UseCase<RequestMergeInput, Result<{ mergeRequestId: string }, RequestMergeError>>
{
  constructor(
    @Inject(REPOSITORY_STORE) private readonly repositories: RepositoryStore,
    @Inject(BRANCH_STORE) private readonly branches: BranchStore,
    @Inject(MERGE_REQUEST_STORE) private readonly merges: MergeRequestStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: RequestMergeInput,
  ): Promise<Result<{ mergeRequestId: string }, RequestMergeError>> {
    const repository = await this.repositories.findById(input.repositoryId);
    if (!repository || repository.workspaceId !== input.workspaceId) {
      return Result.fail(new RepositoryNotFoundError(input.repositoryId));
    }
    for (const branchId of [input.sourceBranchId, input.targetBranchId]) {
      const branch = await this.branches.findById(branchId);
      if (!branch || branch.repositoryId !== repository.id.value) {
        return Result.fail(new BranchNotFoundError(branchId));
      }
    }
    const actor = ActorRef.create(input.actorType, input.actorId);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }

    const request = MergeRequest.request({
      repositoryId: repository.id.value,
      workspaceId: input.workspaceId,
      sourceBranchId: input.sourceBranchId,
      targetBranchId: input.targetBranchId,
      taskId: input.taskId,
      requestedBy: actor.value,
      now: this.clock.now(),
    });
    if (request.isFailure) {
      return Result.fail(request.error);
    }

    await this.merges.save(request.value);
    await flushDomainEvents(request.value, this.publisher);
    return Result.ok({ mergeRequestId: request.value.id.value });
  }
}

export interface DecideMergeInput {
  workspaceId: string;
  repositoryId: string;
  mergeRequestId: string;
  decision: "APPROVE" | "REJECT";
  reason?: string;
  actorType: ActorType;
  actorId: string;
}

export type DecideMergeError =
  | GuardViolation
  | RepositoryNotFoundError
  | MergeRequestNotFoundError
  | MergeNotAllowedError
  | InvalidStateTransitionError;

/**
 * §8.7 — the four conditions, then the decision.
 *
 * "Validations réussies" is answered by `TASK_PROOF`, unchanged: §11.7 asks
 * the same question about completing a task, and it IS the same question —
 * is this task's work proven? A second check here would be two places to keep
 * in agreement, and the day they diverged a merge would land on work the
 * system refuses to call finished.
 */
@Injectable()
export class DecideMergeUseCase
  implements UseCase<DecideMergeInput, Result<void, DecideMergeError>>
{
  constructor(
    @Inject(REPOSITORY_STORE) private readonly repositories: RepositoryStore,
    @Inject(MERGE_REQUEST_STORE) private readonly merges: MergeRequestStore,
    @Inject(BRANCH_STORE) private readonly branches: BranchStore,
    @Inject(TASK_PROOF) private readonly proof: TaskProofPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
  ) {}

  async execute(input: DecideMergeInput): Promise<Result<void, DecideMergeError>> {
    const repository = await this.repositories.findById(input.repositoryId);
    if (!repository || repository.workspaceId !== input.workspaceId) {
      return Result.fail(new RepositoryNotFoundError(input.repositoryId));
    }
    const request = await this.merges.findById(input.mergeRequestId);
    if (!request || request.repositoryId !== repository.id.value) {
      return Result.fail(new MergeRequestNotFoundError(input.mergeRequestId));
    }
    const actor = ActorRef.create(input.actorType, input.actorId);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }

    const now = this.clock.now();
    const previousStatus = request.status;

    if (input.decision === "REJECT") {
      const rejected = request.reject(actor.value, input.reason ?? "rejected", now);
      if (rejected.isFailure) {
        return Result.fail(rejected.error);
      }
    } else {
      const unmet = unmetMergeConditions({
        unsatisfiedValidations: await this.proof.unsatisfiedMandatory(request.taskId),
        // Nothing violates a Git policy yet: the checks §12.3 describes need a
        // working copy to run against. Named in the module doc rather than
        // silently reported as satisfied.
        violatedPolicies: [],
        /**
         * §8.8-8.9 — no longer empty by construction.
         *
         * A conflict is discovered by attempting to catch up with the base
         * branch, which needs a working copy, which only a machine has. The
         * machine reports it, the task is blocked by it, and this reads it
         * back. Until that chain existed this list was empty because nothing
         * reported into it — which is a different thing from there being no
         * conflict, and the comment here said so.
         */
        openConflicts: await this.proof.openConflicts(request.taskId),
        approved: true,
      });
      if (unmet.length > 0) {
        return Result.fail(new MergeNotAllowedError(unmet));
      }
      const approved = request.approve(actor.value, now);
      if (approved.isFailure) {
        return Result.fail(approved.error);
      }
      // Approved and merged in one step, because nothing executes a merge
      // separately yet — and pretending there is a gap the Worker will fill
      // would leave requests stuck in APPROVED with nobody to move them.
      const merged = request.markMerged(now);
      if (merged.isFailure) {
        return Result.fail(merged.error);
      }
      const source = await this.branches.findById(request.sourceBranchId);
      if (source) {
        source.markMerged();
        await this.branches.save(source);
      }
    }

    await this.merges.save(request);
    await flushDomainEvents(request, this.publisher);

    // §18.7 audits "Merge" — the first of its four missing producers to
    // arrive, and the reason `before`/`after` cannot come from an Event.
    await this.audit.record({
      workspaceId: input.workspaceId,
      actor: actor.value,
      action: "repository.merge_decided",
      targetType: "merge_request",
      targetId: request.id.value,
      before: { status: previousStatus },
      after: { status: request.status, reason: request.decisionReason },
    });
    return Result.ok(undefined);
  }
}
