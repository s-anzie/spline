import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from "@nestjs/common";

import { InvalidEmailError } from "../domain/user.errors";
import { User } from "../domain/user";
import { EmailAlreadyInUseError } from "../application/identity-application.errors";
import { LoginUseCase } from "../application/login.use-case";
import { RegisterUserError, RegisterUserUseCase } from "../application/register-user.use-case";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

function toUserResponse(user: User) {
  return { id: user.id.toString(), email: user.email, displayName: user.displayName };
}

function toRegisterHttpError(error: RegisterUserError): ConflictException | BadRequestException {
  if (error instanceof EmailAlreadyInUseError) {
    return new ConflictException(error.message);
  }
  if (error instanceof InvalidEmailError) {
    return new BadRequestException(error.message);
  }
  return error satisfies never;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUserUseCase,
    private readonly loginUseCase: LoginUseCase,
  ) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    const result = await this.registerUseCase.execute(dto);
    if (result.isFailure) {
      throw toRegisterHttpError(result.error);
    }
    return toUserResponse(result.value);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    const result = await this.loginUseCase.execute(dto);
    if (result.isFailure) {
      throw new UnauthorizedException(result.error.message);
    }
    return { token: result.value.token, user: toUserResponse(result.value.user) };
  }
}
