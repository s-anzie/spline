import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  HttpCode,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { authThrottleLimit, throttleTtlMs } from "../../../config/throttle";
import { ActorIdentity } from "../application/permissions.service";
import { LoginUseCase } from "../application/login.use-case";
import { RegisterUserUseCase } from "../application/register-user.use-case";
import {
  USER_REPOSITORY,
  UserRepository,
} from "../domain/ports/identity.repository.ports";
import { ActorAuthGuard } from "./actor-auth.guard";
import { CurrentActor } from "./current-actor.decorator";
import { LoginDto, RegisterDto } from "./dto/auth.dtos";

/**
 * The two routes a stranger may call without a token, which is exactly what
 * makes them the two routes worth flooding: /login guesses a password,
 * /register mints accounts. Both are narrowed well below the global ceiling
 * (§18) — a person logs in a handful of times a minute at worst, and a
 * script that needs more than that is not a person.
 */
const GUESSING_A_SECRET = { default: { ttl: throttleTtlMs(), limit: authThrottleLimit() } };

@Controller("auth")
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly login: LoginUseCase,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  @Post("register")
  @Throttle(GUESSING_A_SECRET)
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
  @Throttle(GUESSING_A_SECRET)
  async logIn(@Body() dto: LoginDto): Promise<{ accessToken: string; userId: string }> {
    const result = await this.login.execute(dto);
    if (result.isFailure) {
      throw new UnauthorizedException(result.error.message);
    }
    return result.value;
  }

  /**
   * The identity a client renders. Humans carry a profile; other actor types
   * are named by the module that registers them, so they answer with their
   * reference alone.
   */
  @Get("me")
  @UseGuards(ActorAuthGuard)
  async me(@CurrentActor() actor: ActorIdentity): Promise<{
    actorType: string;
    actorId: string;
    displayName: string | null;
    email: string | null;
  }> {
    const user =
      actor.actorType === "HUMAN" ? await this.users.findById(actor.actorId) : null;
    return {
      ...actor,
      displayName: user?.displayName ?? null,
      email: user?.email.value ?? null,
    };
  }
}
