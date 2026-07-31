import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { PASSWORD_HASHER, PasswordHasher } from "./ports/password-hasher.port";
import { USER_REPOSITORY, UserRepository } from "../domain/ports/user.repository.port";
import { User } from "../domain/user";
import { InvalidEmailError } from "../domain/user.errors";
import { EmailAlreadyInUseError } from "./identity-application.errors";

export interface RegisterUserInput {
  email: string;
  password: string;
  displayName: string;
}

export type RegisterUserError = EmailAlreadyInUseError | InvalidEmailError;

@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(input: RegisterUserInput): Promise<Result<User, RegisterUserError>> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await this.users.findByEmail(normalizedEmail);
    if (existing) {
      return Result.fail(new EmailAlreadyInUseError(normalizedEmail));
    }

    let user: User;
    try {
      const passwordHash = await this.passwordHasher.hash(input.password);
      user = User.create({
        email: input.email,
        passwordHash,
        displayName: input.displayName,
      });
    } catch (error) {
      if (error instanceof InvalidEmailError) {
        return Result.fail(error);
      }
      throw error;
    }

    await this.users.save(user);
    return Result.ok(user);
  }
}
