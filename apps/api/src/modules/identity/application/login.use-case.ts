import { Inject, Injectable } from "@nestjs/common";

import { Result } from "../../../kernel/domain/result";
import { USER_REPOSITORY, UserRepository } from "../domain/ports/user.repository.port";
import { User } from "../domain/user";
import { InvalidCredentialsError } from "./identity-application.errors";
import { PASSWORD_HASHER, PasswordHasher } from "./ports/password-hasher.port";
import { TOKEN_SERVICE, TokenService } from "./ports/token-service.port";

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginOutput {
  user: User;
  token: string;
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
  ) {}

  async execute(input: LoginInput): Promise<Result<LoginOutput, InvalidCredentialsError>> {
    const user = await this.users.findByEmail(input.email.trim().toLowerCase());
    if (!user) {
      return Result.fail(new InvalidCredentialsError());
    }

    const passwordMatches = await this.passwordHasher.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      return Result.fail(new InvalidCredentialsError());
    }

    const token = this.tokenService.sign({ sub: user.id.toString(), kind: "user" });
    return Result.ok({ user, token });
  }
}
