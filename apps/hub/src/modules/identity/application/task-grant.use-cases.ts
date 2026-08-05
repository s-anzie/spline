import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { DomainError } from "../../../kernel/domain/domain-error";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef } from "../domain/actor";
import { MalformedActorTokenError } from "../domain/identity.errors";
import { Permission } from "../domain/permission-matrix";
import {
  TASK_GRANT_REPOSITORY,
  TaskGrantRepository,
  WORKSPACE_MEMBERSHIP_REPOSITORY,
  WorkspaceMembershipRepository,
} from "../domain/ports/identity.repository.ports";
import {
  PASSWORD_HASHER,
  PasswordHasher,
  SECRET_GENERATOR,
  SecretGenerator,
} from "../domain/ports/identity.service.ports";
import { PROTOCOL_SCOPES, TaskGrant } from "../domain/task-grant";
import { roleHasPermission } from "../domain/permission-matrix";

/**
 * The token prefix. Deliberately distinct from `agent_`/`worker_`/`service_`:
 * a grant is not an actor credential, and the guard must never confuse the
 * two — one is a lasting identity, the other is an hour of one job.
 */
const GRANT_PREFIX = "grant_";

export function buildGrantToken(id: string, secret: string): string {
  return `${GRANT_PREFIX}${id}.${secret}`;
}

export function isGrantToken(token: string): boolean {
  return token.startsWith(GRANT_PREFIX);
}

export function parseGrantToken(
  raw: string,
): Result<{ grantId: string; secret: string }, MalformedActorTokenError> {
  const match = /^grant_([^.]+)\.(.+)$/.exec(raw);
  return match
    ? Result.ok({ grantId: match[1] as string, secret: match[2] as string })
    : Result.fail(new MalformedActorTokenError());
}

/**
 * §18.10 — the actor holds nothing this grant could restrict.
 *
 * Named rather than returning an empty grant: a credential that permits
 * nothing gives its holder refusals with no explanation, several layers from
 * the membership that is actually missing.
 */
export class NoGrantableScopesError extends DomainError {
  constructor(actorId: string, workspaceId: string) {
    super(
      `"${actorId}" holds none of the protocol's permissions in this workspace, ` +
        `so there is nothing to grant (${workspaceId}) — check its membership (§18.3)`,
    );
  }
}

export interface IssueTaskGrantInput {
  workspaceId: string;
  taskId: string;
  actor: ActorRef;
  /** Defaults to the protocol's own scopes (§10). */
  requested?: readonly Permission[];
  ttlMs: number;
}

export interface IssueTaskGrantOutput {
  /** Shown exactly once — only the hash is stored. */
  token: string;
  grantId: string;
  scopes: readonly Permission[];
  expiresAt: string;
}

/**
 * §18.2, §18.10 — mints the credential an agent uses to run the protocol.
 *
 * **The intersection is the whole point.** What is granted is what was asked
 * for AND what the actor's role already allows — never a superset. OpenClaw
 * shipped a rotation path without that check (CVE-2026-32922) and a caller
 * holding a pairing scope could mint an admin one; the rule costs one filter
 * and the omission cost them a 9.9.
 */
@Injectable()
export class IssueTaskGrantUseCase
  implements
    UseCase<
      IssueTaskGrantInput,
      Result<IssueTaskGrantOutput, GuardViolation | NoGrantableScopesError>
    >
{
  constructor(
    @Inject(TASK_GRANT_REPOSITORY) private readonly grants: TaskGrantRepository,
    @Inject(WORKSPACE_MEMBERSHIP_REPOSITORY)
    private readonly memberships: WorkspaceMembershipRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: IssueTaskGrantInput,
  ): Promise<Result<IssueTaskGrantOutput, GuardViolation | NoGrantableScopesError>> {
    const membership = await this.memberships.findByActorAndWorkspace(
      input.actor,
      input.workspaceId,
    );
    if (!membership) {
      return Result.fail(
        new NoGrantableScopesError(input.actor.actorId, input.workspaceId),
      );
    }

    // The intersection. Asked for ∩ actually held.
    const asked = input.requested ?? PROTOCOL_SCOPES;
    const scopes = asked.filter((permission) =>
      roleHasPermission(membership.role, permission),
    );
    if (scopes.length === 0) {
      return Result.fail(
        new NoGrantableScopesError(input.actor.actorId, input.workspaceId),
      );
    }

    const secret = this.secrets.generate();
    const grant = TaskGrant.issue({
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      actor: input.actor,
      scopes,
      tokenHash: await this.hasher.hash(secret),
      ttlMs: input.ttlMs,
      now: this.clock.now(),
    });
    if (grant.isFailure) {
      return Result.fail(grant.error);
    }

    await this.grants.save(grant.value);
    await flushDomainEvents(grant.value, this.publisher);
    return Result.ok({
      token: buildGrantToken(grant.value.id.value, secret),
      grantId: grant.value.id.value,
      scopes,
      expiresAt: grant.value.expiresAt.toISOString(),
    });
  }
}

export interface VerifiedGrant {
  actor: ActorRef;
  workspaceId: string;
  taskId: string;
  scopes: readonly Permission[];
}

/**
 * §18.2 — resolves a grant token to the agent it acts as, plus the leash.
 *
 * Every failure answers identically. Distinguishing "no such grant" from
 * "expired" from "wrong secret" would tell somebody probing which of the
 * three they achieved.
 */
@Injectable()
export class VerifyTaskGrantUseCase
  implements UseCase<{ token: string }, Result<VerifiedGrant, MalformedActorTokenError>>
{
  constructor(
    @Inject(TASK_GRANT_REPOSITORY) private readonly grants: TaskGrantRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: {
    token: string;
  }): Promise<Result<VerifiedGrant, MalformedActorTokenError>> {
    const parsed = parseGrantToken(input.token);
    if (parsed.isFailure) {
      return Result.fail(parsed.error);
    }

    const grant = await this.grants.findById(parsed.value.grantId);
    if (!grant || !grant.isUsableAt(this.clock.now())) {
      return Result.fail(new MalformedActorTokenError());
    }
    if (!(await this.hasher.compare(parsed.value.secret, grant.tokenHash))) {
      return Result.fail(new MalformedActorTokenError());
    }

    return Result.ok({
      actor: grant.actor,
      workspaceId: grant.workspaceId,
      taskId: grant.taskId,
      scopes: grant.scopes,
    });
  }
}
