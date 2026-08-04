import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { StateMachine } from "../../../kernel/domain/state-machine";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";
import { MergeNotAllowedError } from "./repository.errors";

export const MERGE_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "MERGED",
] as const;
export type MergeStatus = (typeof MERGE_STATUSES)[number];

const STATUS_MACHINE = new StateMachine<MergeStatus>({
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["MERGED"],
  REJECTED: [],
  MERGED: [],
});

export interface MergeConditions {
  /** §8.7 "validations réussies" — answered by TASK_PROOF, not re-derived. */
  unsatisfiedValidations: readonly { id: string; type: string }[];
  /** §8.7 "politiques satisfaites" (§12.3 type Git). */
  violatedPolicies: readonly string[];
  /** §8.9 "un conflit non résolu bloque la tâche". */
  openConflicts: readonly { id: string; type: string }[];
  /** §8.7 "approbations obtenues". */
  approved: boolean;
}

/**
 * §8.7's four conditions, each reported by name.
 *
 * Every unmet condition is returned, not the first: a refusal that reveals
 * one problem per attempt makes a caller fix, retry, discover the next, and
 * is the shape §17.8 is about — the answer has to be actionable in one read.
 */
export function unmetMergeConditions(conditions: MergeConditions): string[] {
  const unmet: string[] = [];
  if (conditions.unsatisfiedValidations.length > 0) {
    unmet.push(
      `validations not passed: ${conditions.unsatisfiedValidations
        .map((validation) => `${validation.type} (${validation.id})`)
        .join(", ")}`,
    );
  }
  if (conditions.violatedPolicies.length > 0) {
    unmet.push(`policies violated: ${conditions.violatedPolicies.join(", ")}`);
  }
  if (conditions.openConflicts.length > 0) {
    unmet.push(
      `conflicts unresolved: ${conditions.openConflicts
        .map((conflict) => `${conflict.type} (${conflict.id})`)
        .join(", ")}`,
    );
  }
  if (!conditions.approved) {
    unmet.push("approval missing — a merge is never performed by an agent (§8.7)");
  }
  return unmet;
}

export class MergeRequested extends BaseDomainEvent {
  readonly eventName = "repository.merge_requested";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string | null,
    readonly repositoryId: string,
    readonly taskId: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class MergeCompleted extends BaseDomainEvent {
  readonly eventName = "repository.merge_completed";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string | null,
    readonly repositoryId: string,
    readonly taskId: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

export class MergeRejected extends BaseDomainEvent {
  readonly eventName = "repository.merge_rejected";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string | null,
    readonly repositoryId: string,
    readonly taskId: string,
    readonly reason: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

interface MergeProps {
  repositoryId: string;
  workspaceId: string | null;
  sourceBranchId: string;
  targetBranchId: string;
  taskId: string;
  status: MergeStatus;
  requestedBy: ActorRef;
  decidedBy: ActorRef | null;
  decisionReason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  mergedAt: Date | null;
}

export interface RequestMergeProps {
  repositoryId: string;
  workspaceId?: string | null;
  sourceBranchId: string;
  targetBranchId: string;
  taskId: string;
  requestedBy: ActorRef;
  now: Date;
}

export class MergeRequest extends AggregateRoot<MergeProps> {
  static request(
    input: RequestMergeProps,
    id?: UniqueEntityId,
  ): Result<MergeRequest, GuardViolation> {
    for (const [value, name] of [
      [input.repositoryId, "repositoryId"],
      [input.sourceBranchId, "sourceBranchId"],
      [input.targetBranchId, "targetBranchId"],
      [input.taskId, "taskId"],
    ] as const) {
      const guarded = Guard.againstEmpty(value, name);
      if (guarded.isFailure) {
        return Result.fail(guarded.error);
      }
    }
    if (input.sourceBranchId === input.targetBranchId) {
      return Result.fail(
        new GuardViolation("targetBranchId", "must differ from the source branch"),
      );
    }

    const request = new MergeRequest(
      {
        repositoryId: input.repositoryId,
        workspaceId: input.workspaceId ?? null,
        sourceBranchId: input.sourceBranchId,
        targetBranchId: input.targetBranchId,
        taskId: input.taskId,
        status: "PENDING",
        requestedBy: input.requestedBy,
        decidedBy: null,
        decisionReason: null,
        createdAt: input.now,
        decidedAt: null,
        mergedAt: null,
      },
      id,
    );
    request.addDomainEvent(
      new MergeRequested(
        request.id.value,
        input.now,
        request.workspaceId,
        input.repositoryId,
        input.taskId,
      ),
    );
    return Result.ok(request);
  }

  static reconstitute(props: MergeProps, id: string): MergeRequest {
    return new MergeRequest(props, new UniqueEntityId(id));
  }

  get repositoryId(): string {
    return this.props.repositoryId;
  }

  get workspaceId(): string | null {
    return this.props.workspaceId;
  }

  get sourceBranchId(): string {
    return this.props.sourceBranchId;
  }

  get targetBranchId(): string {
    return this.props.targetBranchId;
  }

  get taskId(): string {
    return this.props.taskId;
  }

  get status(): MergeStatus {
    return this.props.status;
  }

  get requestedBy(): ActorRef {
    return this.props.requestedBy;
  }

  get decidedBy(): ActorRef | null {
    return this.props.decidedBy;
  }

  get decisionReason(): string | null {
    return this.props.decisionReason;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get decidedAt(): Date | null {
    return this.props.decidedAt;
  }

  get mergedAt(): Date | null {
    return this.props.mergedAt;
  }

  /**
   * §8.7 — "jamais réalisé par un agent". The permission matrix already
   * refuses `approve_validation` to every agent role, so the route cannot let
   * one through; stated again here so the aggregate is correct on its own
   * rather than correct because a guard happened to run.
   */
  approve(
    actor: ActorRef,
    now: Date,
  ): Result<void, MergeNotAllowedError | InvalidStateTransitionError> {
    if (actor.type === "AGENT") {
      return Result.fail(
        new MergeNotAllowedError([
          "a merge is never performed by an agent (§8.7)",
        ]),
      );
    }
    return this.decide("APPROVED", actor, null, now);
  }

  reject(
    actor: ActorRef,
    reason: string,
    now: Date,
  ): Result<void, MergeNotAllowedError | InvalidStateTransitionError> {
    return this.decide("REJECTED", actor, reason, now);
  }

  markMerged(now: Date): Result<void, InvalidStateTransitionError> {
    const outcome = STATUS_MACHINE.transition(this.props.status, "MERGED");
    if (outcome.kind !== "transitioned") {
      return Result.fail(
        new InvalidStateTransitionError("MergeRequest", {
          kind: "invalidTransition",
          from: this.props.status,
          to: "MERGED",
          fromTerminal: STATUS_MACHINE.isTerminal(this.props.status),
        }),
      );
    }
    this.props.status = "MERGED";
    this.props.mergedAt = now;
    this.addDomainEvent(
      new MergeCompleted(
        this.id.value,
        now,
        this.props.workspaceId,
        this.props.repositoryId,
        this.props.taskId,
      ),
    );
    return Result.ok(undefined);
  }

  allowedStatusTargets(): readonly MergeStatus[] {
    return STATUS_MACHINE.allowedFrom(this.props.status);
  }

  private decide(
    next: MergeStatus,
    actor: ActorRef,
    reason: string | null,
    now: Date,
  ): Result<void, InvalidStateTransitionError> {
    const outcome = STATUS_MACHINE.transition(this.props.status, next);
    if (outcome.kind !== "transitioned") {
      return Result.fail(
        new InvalidStateTransitionError("MergeRequest", {
          kind: "invalidTransition",
          from: this.props.status,
          to: next,
          fromTerminal: STATUS_MACHINE.isTerminal(this.props.status),
        }),
      );
    }
    this.props.status = next;
    this.props.decidedBy = actor;
    this.props.decisionReason = reason;
    this.props.decidedAt = now;
    if (next === "REJECTED") {
      this.addDomainEvent(
        new MergeRejected(
          this.id.value,
          now,
          this.props.workspaceId,
          this.props.repositoryId,
          this.props.taskId,
          reason ?? "",
        ),
      );
    }
    return Result.ok(undefined);
  }
}
