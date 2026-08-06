import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { Email } from "./email";
import { UserRegistered } from "./identity-events";

interface UserProps {
  email: Email;
  passwordHash: string;
  displayName: string;
  createdAt: Date;
}

export interface CreateUserInput {
  email: Email;
  passwordHash: string;
  displayName: string;
  now: Date;
}

export class User extends AggregateRoot<UserProps> {
  static create(input: CreateUserInput, id?: UniqueEntityId): Result<User, GuardViolation> {
    const displayName = Guard.againstEmpty(input.displayName, "displayName");
    const passwordHash = Guard.againstEmpty(input.passwordHash, "passwordHash");
    const guards = Result.combine([displayName, passwordHash]);
    if (guards.isFailure) {
      return Result.fail(guards.error);
    }

    const user = new User(
      {
        email: input.email,
        passwordHash: passwordHash.value,
        displayName: displayName.value,
        createdAt: input.now,
      },
      id,
    );
    user.addDomainEvent(new UserRegistered(user.id.value, input.now, input.email.value));
    return Result.ok(user);
  }

  /** Rebuild from persistence — never raises events. */
  static reconstitute(props: UserProps, id: string): User {
    return new User(props, new UniqueEntityId(id));
  }

  get email(): Email {
    return this.props.email;
  }

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get displayName(): string {
    return this.props.displayName;
  }

  /**
   * The name every member list, thread and assignee shows. It could not be
   * changed, so a typo at sign-up followed somebody around forever.
   *
   * The email is not here on purpose: it is the identity somebody signs in
   * with, and moving it needs proof of the new address before it starts
   * working — a different act, not a longer version of this one.
   */
  rename(displayName: string): Result<void, GuardViolation> {
    const guarded = Guard.againstEmpty(displayName, "displayName");
    if (guarded.isFailure) {
      return Result.fail(guarded.error);
    }
    this.props.displayName = guarded.value.trim();
    return Result.ok(undefined);
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
