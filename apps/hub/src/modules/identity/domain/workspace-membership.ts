import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef, ActorType } from "./actor";
import {
  MembershipGranted,
  MembershipRevoked,
  MembershipRoleChanged,
} from "./identity-events";
import { IncompatibleRoleError } from "./identity.errors";
import { WorkspaceRole } from "./permission-matrix";

/**
 * Role/actor compatibility: humans hold human roles, agents hold agent
 * roles. Workers hold no workspace role at all — their authority is
 * machine-scoped (worker↔workspace links live in the runtime module), not
 * membership-based. Services may observe.
 */
const ROLES_BY_ACTOR_TYPE: Record<ActorType, readonly WorkspaceRole[]> = {
  HUMAN: ["OWNER", "HUMAN_OPERATOR", "VIEWER"],
  AGENT: ["AGENT_MANAGER", "AGENT_CONTRIBUTOR", "READ_ONLY_AGENT"],
  WORKER: [],
  SERVICE: ["VIEWER"],
};

interface MembershipProps {
  actor: ActorRef;
  workspaceId: string;
  role: WorkspaceRole;
  createdAt: Date;
  revoked: boolean;
}

export interface CreateMembershipInput {
  actor: ActorRef;
  workspaceId: string;
  role: WorkspaceRole;
  now: Date;
}

export class WorkspaceMembership extends AggregateRoot<MembershipProps> {
  static create(
    input: CreateMembershipInput,
    id?: UniqueEntityId,
  ): Result<WorkspaceMembership, GuardViolation | IncompatibleRoleError> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    if (!ROLES_BY_ACTOR_TYPE[input.actor.type].includes(input.role)) {
      return Result.fail(new IncompatibleRoleError(input.actor.type, input.role));
    }

    const membership = new WorkspaceMembership(
      {
        actor: input.actor,
        workspaceId: workspaceId.value,
        role: input.role,
        createdAt: input.now,
        revoked: false,
      },
      id,
    );
    membership.addDomainEvent(
      new MembershipGranted(
        membership.id.value,
        input.now,
        workspaceId.value,
        input.actor,
        input.role,
      ),
    );
    return Result.ok(membership);
  }

  /** Rebuild from persistence — never raises events. */
  static reconstitute(
    props: Omit<MembershipProps, "revoked">,
    id: string,
  ): WorkspaceMembership {
    return new WorkspaceMembership({ ...props, revoked: false }, new UniqueEntityId(id));
  }

  get actor(): ActorRef {
    return this.props.actor;
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get role(): WorkspaceRole {
    return this.props.role;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** Idempotent: changing to the current role succeeds without an event (§22.6 spirit). */
  changeRole(next: WorkspaceRole, now: Date): Result<void, IncompatibleRoleError> {
    if (next === this.props.role) {
      return Result.ok(undefined);
    }
    if (!ROLES_BY_ACTOR_TYPE[this.props.actor.type].includes(next)) {
      return Result.fail(new IncompatibleRoleError(this.props.actor.type, next));
    }
    const previous = this.props.role;
    this.props.role = next;
    this.addDomainEvent(
      new MembershipRoleChanged(this.id.value, now, this.props.workspaceId, previous, next),
    );
    return Result.ok(undefined);
  }

  /** Idempotent: raises identity.membership_revoked exactly once. */
  revoke(now: Date): void {
    if (this.props.revoked) {
      return;
    }
    this.props.revoked = true;
    this.addDomainEvent(
      new MembershipRevoked(this.id.value, now, this.props.workspaceId, this.props.actor),
    );
  }
}
