import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { isExpired } from "../../../kernel/domain/staleness";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "./actor";
import { Permission } from "./permission-matrix";

/**
 * §10 — what an agent needs to run the protocol, and nothing beyond it.
 *
 * Synchronize and Read need to see the workspace; Plan records a decision;
 * Publish contributes; Acquire and Release take locks; Validate asks. Each
 * line of the cycle maps to one permission, which is what makes this list
 * reviewable rather than a guess.
 */
export const PROTOCOL_SCOPES: readonly Permission[] = [
  "read_workspace_state",
  "contribute_knowledge",
  "record_decisions",
  "request_validation",
  "acquire_locks",
  "execute_tasks",
];

export class TaskGrantIssued extends BaseDomainEvent {
  readonly eventName = "identity.task_grant_issued";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly taskId: string,
    readonly actor: ActorRef,
    readonly scopes: readonly Permission[],
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

interface GrantProps {
  workspaceId: string;
  taskId: string;
  /** The AGENT this acts as. A machine carries it; it never becomes one. */
  actor: ActorRef;
  scopes: Permission[];
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface IssueGrantProps {
  workspaceId: string;
  taskId: string;
  actor: ActorRef;
  /** Already intersected with what the actor's role allows. */
  scopes: readonly Permission[];
  tokenHash: string;
  ttlMs: number;
  now: Date;
}

/**
 * §18.2, §18.10 — a credential that can do one job, in one workspace, for a
 * short while.
 *
 * It exists because of a question with only bad other answers: when an agent
 * calls back into the hub mid-task, WHOSE credential does it use? The
 * machine's would make every entry in the journal say the machine did what
 * the agent did — the impersonation §18.10 is entirely about. A long-lived
 * agent credential would hand a poisoned task the agent's whole authority,
 * for ever.
 *
 * So: the agent's identity, this workspace, this task, these scopes, this
 * hour. The scopes are an INTERSECTION of what was asked for and what the
 * actor's role actually allows — never a superset. That rule is not
 * theoretical: OpenClaw shipped a token-rotation path without it
 * (CVE-2026-32922), and a caller holding a pairing scope could mint an admin
 * one.
 */
export class TaskGrant extends AggregateRoot<GrantProps> {
  static issue(
    input: IssueGrantProps,
    id?: UniqueEntityId,
  ): Result<TaskGrant, GuardViolation> {
    for (const [value, name] of [
      [input.workspaceId, "workspaceId"],
      [input.taskId, "taskId"],
      [input.tokenHash, "tokenHash"],
    ] as const) {
      const guarded = Guard.againstEmpty(value, name);
      if (guarded.isFailure) {
        return Result.fail(guarded.error);
      }
    }
    if (input.scopes.length === 0) {
      return Result.fail(
        new GuardViolation(
          "scopes",
          "a grant that permits nothing is not a credential — refuse the caller instead (§18.1)",
        ),
      );
    }
    if (input.ttlMs <= 0) {
      return Result.fail(
        new GuardViolation("ttlMs", "a grant must expire, and not in the past"),
      );
    }

    const grant = new TaskGrant(
      {
        workspaceId: input.workspaceId,
        taskId: input.taskId,
        actor: input.actor,
        scopes: [...input.scopes],
        tokenHash: input.tokenHash,
        createdAt: input.now,
        expiresAt: new Date(input.now.getTime() + input.ttlMs),
        revokedAt: null,
      },
      id,
    );
    grant.addDomainEvent(
      new TaskGrantIssued(
        grant.id.value,
        input.now,
        input.workspaceId,
        input.taskId,
        input.actor,
        grant.scopes,
      ),
    );
    return Result.ok(grant);
  }

  static reconstitute(props: GrantProps, id: string): TaskGrant {
    return new TaskGrant(props, new UniqueEntityId(id));
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get taskId(): string {
    return this.props.taskId;
  }

  get actor(): ActorRef {
    return this.props.actor;
  }

  get scopes(): readonly Permission[] {
    return [...this.props.scopes];
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }

  /** Judged at read, like every other expiry here (§17.7, §13.5). */
  isUsableAt(now: Date): boolean {
    return this.props.revokedAt === null && !isExpired(this.props.expiresAt, now);
  }

  /**
   * §18.10 — the grant restricts; it never widens. A permission the role does
   * not hold cannot be in here, because the intersection happened before this
   * object existed — but asking twice costs nothing and this is the side that
   * gets read on every request.
   */
  permits(permission: Permission, workspaceId: string): boolean {
    return (
      this.props.workspaceId === workspaceId && this.props.scopes.includes(permission)
    );
  }

  revoke(now: Date): void {
    this.props.revokedAt ??= now;
  }
}
