import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { slugify } from "../../../kernel/domain/slug";
import { StateMachine } from "../../../kernel/domain/state-machine";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import {
  WorkspaceCreated,
  WorkspaceStatusChanged,
  WorkspaceUpdated,
} from "./workspace-events";
import {
  InvalidWorkspaceNameError,
  WorkspaceNotActiveError,
} from "./workspace.errors";

export const WORKSPACE_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

/**
 * Deletion is logical and reachable only through ARCHIVED — nothing
 * important ever disappears without first being visibly out of service.
 */
const STATUS_MACHINE = new StateMachine<WorkspaceStatus>({
  ACTIVE: ["PAUSED", "ARCHIVED"],
  PAUSED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: ["ACTIVE", "DELETED"],
  DELETED: [],
});

/**
 * Free-form workspace configuration (root path, integration handles, UI
 * preferences…). Deliberately NOT the home of policies: §12's Policy Engine
 * owns those as inheritable entities, and a JSON blob nobody reads would
 * announce rules the system does not actually enforce.
 */
export type WorkspaceSettings = Record<string, unknown>;

interface WorkspaceProps {
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  status: WorkspaceStatus;
  settings: WorkspaceSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWorkspaceProps {
  organizationId: string;
  name: string;
  description?: string;
  settings?: WorkspaceSettings;
  now: Date;
}

export interface UpdateWorkspaceDetailsProps {
  name?: string;
  description?: string;
  settings?: WorkspaceSettings;
}

export type CreateWorkspaceError = GuardViolation | InvalidWorkspaceNameError;

export type UpdateWorkspaceDetailsError =
  | GuardViolation
  | InvalidWorkspaceNameError
  | WorkspaceNotActiveError;


export class Workspace extends AggregateRoot<WorkspaceProps> {
  static create(
    input: CreateWorkspaceProps,
    id?: UniqueEntityId,
  ): Result<Workspace, CreateWorkspaceError> {
    const name = Guard.againstEmpty(input.name, "name");
    const organizationId = Guard.againstEmpty(input.organizationId, "organizationId");
    const guards = Result.combine([name, organizationId]);
    if (guards.isFailure) {
      return Result.fail(guards.error);
    }
    const slug = slugify(name.value);
    if (slug.length === 0) {
      return Result.fail(new InvalidWorkspaceNameError(input.name));
    }
    const settings: WorkspaceSettings = { ...input.settings };

    const workspace = new Workspace(
      {
        organizationId: organizationId.value,
        name: name.value,
        slug,
        description: input.description?.trim() || null,
        status: "ACTIVE",
        settings,
        createdAt: input.now,
        updatedAt: input.now,
      },
      id,
    );
    workspace.addDomainEvent(
      new WorkspaceCreated(workspace.id.value, input.now, organizationId.value, slug),
    );
    return Result.ok(workspace);
  }

  /** Rebuild from persistence — never raises events. */
  static reconstitute(props: WorkspaceProps, id: string): Workspace {
    return new Workspace(props, new UniqueEntityId(id));
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get name(): string {
    return this.props.name;
  }

  get slug(): string {
    return this.props.slug;
  }

  get description(): string | null {
    return this.props.description;
  }

  get status(): WorkspaceStatus {
    return this.props.status;
  }

  get settings(): WorkspaceSettings {
    return this.props.settings;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  updateDetails(
    patch: UpdateWorkspaceDetailsProps,
    now: Date,
  ): Result<void, UpdateWorkspaceDetailsError> {
    if (this.props.status !== "ACTIVE") {
      return Result.fail(new WorkspaceNotActiveError(this.props.status));
    }
    let nextName = this.props.name;
    let nextSlug = this.props.slug;
    if (patch.name !== undefined) {
      const name = Guard.againstEmpty(patch.name, "name");
      if (name.isFailure) {
        return Result.fail(name.error);
      }
      const slug = slugify(name.value);
      if (slug.length === 0) {
        return Result.fail(new InvalidWorkspaceNameError(patch.name));
      }
      nextName = name.value;
      nextSlug = slug;
    }
    const nextSettings =
      patch.settings === undefined
        ? this.props.settings
        : { ...this.props.settings, ...patch.settings };

    this.props.name = nextName;
    this.props.slug = nextSlug;
    if (patch.description !== undefined) {
      this.props.description = patch.description.trim() || null;
    }
    this.props.settings = nextSettings;
    this.props.updatedAt = now;
    this.addDomainEvent(new WorkspaceUpdated(this.id.value, now));
    return Result.ok(undefined);
  }

  /** §22.6: same-state is a silent success; invalid is a typed failure. */
  changeStatus(
    next: WorkspaceStatus,
    now: Date,
  ): Result<void, InvalidStateTransitionError> {
    const outcome = STATUS_MACHINE.transition(this.props.status, next);
    switch (outcome.kind) {
      case "alreadyInState":
        return Result.ok(undefined);
      case "invalidTransition":
        return Result.fail(new InvalidStateTransitionError("Workspace", outcome));
      case "transitioned": {
        const from = this.props.status;
        this.props.status = outcome.to;
        this.props.updatedAt = now;
        this.addDomainEvent(
          new WorkspaceStatusChanged(this.id.value, now, from, outcome.to),
        );
        return Result.ok(undefined);
      }
    }
  }

  /** Interface affordances (§20.6). */
  allowedStatusTargets(): readonly WorkspaceStatus[] {
    return STATUS_MACHINE.allowedFrom(this.props.status);
  }
}
