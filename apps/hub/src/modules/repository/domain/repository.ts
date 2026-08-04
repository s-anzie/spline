import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { DEFAULT_PROTECTED_BRANCHES } from "./branch";

export const REPOSITORY_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type RepositoryStatus = (typeof REPOSITORY_STATUSES)[number];

export class RepositoryRegistered extends BaseDomainEvent {
  readonly eventName = "repository.created";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly name: string,
    readonly origin: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

interface RepositoryProps {
  workspaceId: string;
  name: string;
  origin: string;
  defaultBranch: string;
  extraProtectedBranches: string[];
  status: RepositoryStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterRepositoryProps {
  workspaceId: string;
  name: string;
  /** Where it comes from — a URL, a path, whatever the Worker can reach. */
  origin: string;
  defaultBranch?: string;
  /** A workspace may protect more branches; it never protects fewer (§8.11). */
  extraProtectedBranches?: readonly string[];
  now: Date;
}

/**
 * §8.2. The hub holds the model and the rules; the Worker holds the clone —
 * a control plane has no working copy (§3), so nothing here runs Git.
 */
export class Repository extends AggregateRoot<RepositoryProps> {
  static register(
    input: RegisterRepositoryProps,
    id?: UniqueEntityId,
  ): Result<Repository, GuardViolation> {
    const workspaceId = Guard.againstEmpty(input.workspaceId, "workspaceId");
    if (workspaceId.isFailure) {
      return Result.fail(workspaceId.error);
    }
    const name = Guard.againstEmpty(input.name, "name");
    if (name.isFailure) {
      return Result.fail(name.error);
    }
    const origin = Guard.againstEmpty(input.origin, "origin");
    if (origin.isFailure) {
      return Result.fail(origin.error);
    }
    const defaultBranch = Guard.againstEmpty(
      input.defaultBranch ?? "main",
      "defaultBranch",
    );
    if (defaultBranch.isFailure) {
      return Result.fail(defaultBranch.error);
    }

    const repository = new Repository(
      {
        workspaceId: workspaceId.value,
        name: name.value,
        origin: origin.value,
        defaultBranch: defaultBranch.value,
        extraProtectedBranches: [...(input.extraProtectedBranches ?? [])],
        status: "ACTIVE",
        createdAt: input.now,
        updatedAt: input.now,
      },
      id,
    );
    repository.addDomainEvent(
      new RepositoryRegistered(
        repository.id.value,
        input.now,
        workspaceId.value,
        name.value,
        origin.value,
      ),
    );
    return Result.ok(repository);
  }

  static reconstitute(props: RepositoryProps, id: string): Repository {
    return new Repository(props, new UniqueEntityId(id));
  }

  get workspaceId(): string {
    return this.props.workspaceId;
  }

  get name(): string {
    return this.props.name;
  }

  get origin(): string {
    return this.props.origin;
  }

  get defaultBranch(): string {
    return this.props.defaultBranch;
  }

  get status(): RepositoryStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /**
   * The three §8.3 names, plus this repository's default branch, plus
   * whatever the workspace added. A union, never a replacement: letting a
   * configuration shrink this set would let it disarm §8.11.
   */
  get protectedBranches(): readonly string[] {
    return [
      ...new Set([
        ...DEFAULT_PROTECTED_BRANCHES,
        this.props.defaultBranch,
        ...this.props.extraProtectedBranches,
      ]),
    ];
  }

  protect(names: readonly string[], now: Date): void {
    this.props.extraProtectedBranches = [
      ...new Set([...this.props.extraProtectedBranches, ...names]),
    ];
    this.props.updatedAt = now;
  }

  archive(now: Date): void {
    this.props.status = "ARCHIVED";
    this.props.updatedAt = now;
  }
}
