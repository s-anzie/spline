import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { Result } from "../../../kernel/domain/result";
import { Email } from "../domain/email";
import { InvalidCredentialsError } from "../domain/identity.errors";
import {
  USER_REPOSITORY,
  UserRepository,
} from "../domain/ports/identity.repository.ports";
import {
  PASSWORD_HASHER,
  PasswordHasher,
  TOKEN_SIGNER,
  TokenSigner,
} from "../domain/ports/identity.service.ports";

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginOutput {
  accessToken: string;
  userId: string;
}

@Injectable()
export class LoginUseCase
  implements UseCase<LoginInput, Result<LoginOutput, InvalidCredentialsError>>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_SIGNER) private readonly signer: TokenSigner,
  ) {}

  async execute(input: LoginInput): Promise<Result<LoginOutput, InvalidCredentialsError>> {
    // Every failure path returns the same error: a malformed email, an
    // unknown address and a wrong password must be indistinguishable
    // (anti-enumeration).
    const email = Email.create(input.email);
    if (email.isFailure) {
      return Result.fail(new InvalidCredentialsError());
    }
    const user = await this.users.findByEmail(email.value.value);
    if (!user) {
      return Result.fail(new InvalidCredentialsError());
    }
    const matches = await this.hasher.compare(input.password, user.passwordHash);
    if (!matches) {
      return Result.fail(new InvalidCredentialsError());
    }

    const accessToken = await this.signer.sign({
      sub: user.id.value,
      actorType: "HUMAN",
    });
    return Result.ok({ accessToken, userId: user.id.value });
  }
}
