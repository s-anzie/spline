import { WorkspaceStatus } from "@repo/db";

import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { WorkspaceArchived, WorkspaceCreated } from "./workspace-events";
import { EmptyWorkspaceNameError, WorkspaceArchivedError } from "./workspace.errors";

export interface WorkspaceProps {
  name: string;
  description?: string;
  status: WorkspaceStatus;
  ruleset: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWorkspaceProps {
  name: string;
  description?: string;
  ruleset?: Record<string, unknown>;
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new EmptyWorkspaceNameError();
  }
  return trimmed;
}

export class Workspace extends AggregateRoot<WorkspaceProps> {
  static create(props: CreateWorkspaceProps, id?: UniqueEntityId): Workspace {
    const now = new Date();
    const workspace = new Workspace(
      {
        name: normalizeName(props.name),
        description: props.description,
        status: WorkspaceStatus.ACTIVE,
        ruleset: props.ruleset ?? {},
        createdAt: now,
        updatedAt: now,
      },
      id,
    );
    workspace.record(new WorkspaceCreated(workspace.id.toString()));
    return workspace;
  }

  /** Rehydrates a workspace from storage as-is — no invariants re-applied, no events re-recorded. */
  static reconstitute(props: WorkspaceProps, id: UniqueEntityId): Workspace {
    return new Workspace(props, id);
  }

  get name(): string {
    return this.props.name;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get status(): WorkspaceStatus {
    return this.props.status;
  }

  get ruleset(): Record<string, unknown> {
    return this.props.ruleset;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get isArchived(): boolean {
    return this.props.status === WorkspaceStatus.ARCHIVED;
  }

  private ensureNotArchived(): void {
    if (this.isArchived) {
      throw new WorkspaceArchivedError(this.id.toString());
    }
  }

  rename(newName: string): void {
    this.ensureNotArchived();
    this.props.name = normalizeName(newName);
    this.props.updatedAt = new Date();
  }

  updateRuleset(ruleset: Record<string, unknown>): void {
    this.ensureNotArchived();
    this.props.ruleset = ruleset;
    this.props.updatedAt = new Date();
  }

  archive(): void {
    this.ensureNotArchived();
    this.props.status = WorkspaceStatus.ARCHIVED;
    this.props.updatedAt = new Date();
    this.record(new WorkspaceArchived(this.id.toString()));
  }

  duplicate(newName: string): Workspace {
    return Workspace.create({
      name: newName,
      description: this.props.description,
      ruleset: { ...this.props.ruleset },
    });
  }
}
