import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import { ActorIdentity } from "../application/permissions.service";
import { LoginUseCase } from "../application/login.use-case";
import { RegisterUserUseCase } from "../application/register-user.use-case";
import { ActorAuthGuard } from "./actor-auth.guard";
import { CurrentActor } from "./current-actor.decorator";
import { LoginDto, RegisterDto } from "./dto/auth.dtos";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly login: LoginUseCase,
  ) {}

  @Post("register")
  async register(@Body() dto: RegisterDto): Promise<{
    userId: string;
    organizationId: string;
  }> {
    let result;
    try {
      result = await this.registerUser.execute(dto);
    } catch (error) {
      // Concurrent registration race: the pre-check passed for both callers
      // but the unique index caught the loser — same outcome as the check.
      if ((error as { code?: string }).code === "P2002") {
        throw new ConflictException("This email address is already registered");
      }
      throw error;
    }
    if (result.isFailure) {
      if (result.error.name === "EmailAlreadyInUseError") {
        throw new ConflictException(result.error.message);
      }
      throw new BadRequestException(result.error.message);
    }
    return result.value;
  }

  @Post("login")
  @HttpCode(200)
  async logIn(@Body() dto: LoginDto): Promise<{ accessToken: string; userId: string }> {
    const result = await this.login.execute(dto);
    if (result.isFailure) {
      throw new UnauthorizedException(result.error.message);
    }
    return result.value;
  }

  @Get("me")
  @UseGuards(ActorAuthGuard)
  me(@CurrentActor() actor: ActorIdentity): ActorIdentity {
    return actor;
  }
}
