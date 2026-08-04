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

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
