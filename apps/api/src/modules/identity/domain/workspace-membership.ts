import { ActorType, WorkspaceRole } from "@repo/db";

import { Entity } from "../../../kernel/domain/entity";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";

export interface WorkspaceMembershipProps {
  workspaceId: string;
  actorType: ActorType;
  actorId: string;
  role: WorkspaceRole;
  createdAt: Date;
}

export interface CreateWorkspaceMembershipProps {
  workspaceId: string;
  actorType: ActorType;
  actorId: string;
  role: WorkspaceRole;
  createdAt?: Date;
}

export class WorkspaceMembership extends Entity<WorkspaceMembershipProps> {
  static create(props: CreateWorkspaceMembershipProps, id?: UniqueEntityId): WorkspaceMembership {
    return new WorkspaceMembership(
      {
        workspaceId: props.workspaceId,
        actorType: props.actorType,
        actorId: props.actorId,
        role: props.role,
        createdAt: props.createdAt ?? new Date(),
      },
      id,
    );
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get actorType(): ActorType {
    return this.props.actorType;
  }

  get actorId(): string {
    return this.props.actorId;
  }

  get role(): WorkspaceRole {
    return this.props.role;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  changeRole(role: WorkspaceRole): void {
    this.props.role = role;
  }
}
