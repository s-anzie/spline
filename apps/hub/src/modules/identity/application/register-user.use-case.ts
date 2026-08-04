import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { Email } from "../domain/email";
import {
  EmailAlreadyInUseError,
  InvalidEmailError,
  WeakPasswordError,
} from "../domain/identity.errors";
import { Organization } from "../domain/organization";
import {
  ORGANIZATION_REPOSITORY,
  OrganizationRepository,
  USER_REPOSITORY,
  UserRepository,
} from "../domain/ports/identity.repository.ports";
import {
  PASSWORD_HASHER,
  PasswordHasher,
} from "../domain/ports/identity.service.ports";
import { User } from "../domain/user";

const MINIMUM_PASSWORD_LENGTH = 12;

export interface RegisterUserInput {
  email: string;
  password: string;
  displayName: string;
}

export interface RegisterUserOutput {
  userId: string;
  organizationId: string;
}

export type RegisterUserError =
  | InvalidEmailError
  | WeakPasswordError
  | EmailAlreadyInUseError
  | GuardViolation;

@Injectable()
export class RegisterUserUseCase
  implements UseCase<RegisterUserInput, Result<RegisterUserOutput, RegisterUserError>>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: RegisterUserInput,
  ): Promise<Result<RegisterUserOutput, RegisterUserError>> {
    const email = Email.create(input.email);
    if (email.isFailure) {
      return Result.fail(email.error);
    }
    if (input.password.length < MINIMUM_PASSWORD_LENGTH) {
      return Result.fail(new WeakPasswordError(MINIMUM_PASSWORD_LENGTH));
    }
    if (await this.users.findByEmail(email.value.value)) {
      return Result.fail(new EmailAlreadyInUseError());
    }

    const now = this.clock.now();
    const passwordHash = await this.hasher.hash(input.password);
    const user = User.create({
      email: email.value,
      passwordHash,
      displayName: input.displayName,
      now,
    });
    if (user.isFailure) {
      return Result.fail(user.error);
    }

    // Every user owns a personal organization from day one (§4.1): the top
    // of the hierarchy is never retrofitted. Fall back to a neutral name
    // when the display name cannot produce a valid slug.
    const ownerId = user.value.id.value;
    let organization = Organization.create({
      name: user.value.displayName,
      ownerId,
      now,
    });
    if (organization.isFailure) {
      organization = Organization.create({ name: "Personal Organization", ownerId, now });
    }

    await this.users.save(user.value);
    await this.organizations.save(organization.value);
    await flushDomainEvents(user.value, this.publisher);
    await flushDomainEvents(organization.value, this.publisher);

    return Result.ok({
      userId: ownerId,
      organizationId: organization.value.id.value,
    });
  }
}
