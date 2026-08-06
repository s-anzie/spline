import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  HttpCode,
  NotFoundException,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { authThrottleLimit, throttleTtlMs } from "../../../config/hardening";
import { ActorIdentity } from "../application/permissions.service";
import { LoginUseCase } from "../application/login.use-case";
import { RegisterUserUseCase } from "../application/register-user.use-case";
import {
  USER_REPOSITORY,
  UserRepository,
} from "../domain/ports/identity.repository.ports";
import { ActorAuthGuard } from "./actor-auth.guard";
import { CurrentActor } from "./current-actor.decorator";
import { LoginDto, RegisterDto, UpdateProfileDto } from "./dto/auth.dtos";

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
   * §4 — a person corrects their own name.
   *
   * Only their own, and only the name: the email is what they sign in with,
   * and moving it needs proof of the new address before it starts working.
   * A non-human actor has no profile to edit — it is named by whoever issued
   * its credential, in the registry (§18.2).
   */
  @Patch("me")
  @HttpCode(200)
  @UseGuards(ActorAuthGuard)
  async updateProfile(
    @CurrentActor() actor: ActorIdentity,
    @Body() dto: UpdateProfileDto,
  ): Promise<{ ok: true }> {
    if (actor.actorType !== "HUMAN") {
      throw new ForbiddenException(
        "Only a person has a profile. Non-human actors are named by whoever issued them",
      );
    }
    const user = await this.users.findById(actor.actorId);
    if (!user) {
      throw new NotFoundException("This account no longer exists");
    }
    const renamed = user.rename(dto.displayName);
    if (renamed.isFailure) {
      throw new BadRequestException(renamed.error.message);
    }
    await this.users.save(user);
    return { ok: true };
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
