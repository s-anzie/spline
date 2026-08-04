import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { slugify } from "../../../kernel/domain/slug";
import { OrganizationCreated, OrganizationRenamed } from "./identity-events";
import { InvalidOrganizationNameError } from "./identity.errors";

interface OrganizationProps {
  name: string;
  slug: string;
  ownerId: string;
  createdAt: Date;
}

export interface CreateOrganizationInput {
  name: string;
  ownerId: string;
  now: Date;
}

/**
 * Top of the v3 hierarchy (§4.1): workspaces belong to an organization,
 * policies inherit from it (§12.2). Created automatically for each user at
 * registration; advanced multi-org stays in Future Extensions (§25).
 */
export class Organization extends AggregateRoot<OrganizationProps> {
  static create(
    input: CreateOrganizationInput,
    id?: UniqueEntityId,
  ): Result<Organization, GuardViolation | InvalidOrganizationNameError> {
    const name = Guard.againstEmpty(input.name, "name");
    const ownerId = Guard.againstEmpty(input.ownerId, "ownerId");
    const guards = Result.combine([name, ownerId]);
    if (guards.isFailure) {
      return Result.fail(guards.error);
    }

    const slug = slugify(name.value);
    if (slug.length === 0) {
      return Result.fail(new InvalidOrganizationNameError(input.name));
    }

    const organization = new Organization(
      { name: name.value, slug, ownerId: ownerId.value, createdAt: input.now },
      id,
    );
    organization.addDomainEvent(
      new OrganizationCreated(organization.id.value, input.now, ownerId.value, slug),
    );
    return Result.ok(organization);
  }

  /** Rebuild from persistence — keeps the stored slug, never raises events. */
  static reconstitute(props: OrganizationProps, id: string): Organization {
    return new Organization(props, new UniqueEntityId(id));
  }

  get name(): string {
    return this.props.name;
  }

  get slug(): string {
    return this.props.slug;
  }

  get ownerId(): string {
    return this.props.ownerId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** Idempotent: renaming to the current name raises nothing. */
  rename(
    name: string,
    now: Date,
  ): Result<void, GuardViolation | InvalidOrganizationNameError> {
    const trimmed = Guard.againstEmpty(name, "name");
    if (trimmed.isFailure) {
      return Result.fail(trimmed.error);
    }
    const slug = slugify(trimmed.value);
    if (slug.length === 0) {
      return Result.fail(new InvalidOrganizationNameError(name));
    }
    if (trimmed.value === this.props.name) {
      return Result.ok(undefined);
    }

    this.props.name = trimmed.value;
    this.props.slug = slug;
    this.addDomainEvent(new OrganizationRenamed(this.id.value, now, slug));
    return Result.ok(undefined);
  }
}
