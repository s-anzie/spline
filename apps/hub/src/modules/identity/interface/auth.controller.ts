import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  HttpCode,
  NotFoundException,
  Patch,
  Post,
  Req,
  Res,
  Body,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";

import { authThrottleLimit, throttleTtlMs } from "../../../config/hardening";
import { ActorIdentity } from "../application/permissions.service";
import { LoginUseCase } from "../application/login.use-case";
import { RegisterUserUseCase } from "../application/register-user.use-case";
import {
  CloseSessionUseCase,
  OpenSessionUseCase,
  RefreshSessionUseCase,
} from "../application/session.use-cases";
import {
  USER_REPOSITORY,
  UserRepository,
} from "../domain/ports/identity.repository.ports";
import { ActorAuthGuard } from "./actor-auth.guard";
import { BrowserOriginGuard, ForeignOriginGuard } from "./browser-origin.guard";
import { CurrentActor } from "./current-actor.decorator";
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from "./session-cookie";
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
    private readonly openSession: OpenSessionUseCase,
    private readonly refreshSession: RefreshSessionUseCase,
    private readonly closeSession: CloseSessionUseCase,
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

  /**
   * Two credentials come back, and the difference between them is the point.
   *
   * The access token is in the BODY, short-lived, and the console keeps it in
   * memory where no other page can read it. The session credential is in an
   * httpOnly COOKIE the console itself cannot read, is good for one thing —
   * buying another access token — and is what makes a reload stop being a
   * sign-out.
   */
  @Post("login")
  @HttpCode(200)
  @Throttle(GUESSING_A_SECRET)
  @UseGuards(ForeignOriginGuard)
  async logIn(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ accessToken: string; userId: string }> {
    const result = await this.login.execute(dto);
    if (result.isFailure) {
      throw new UnauthorizedException(result.error.message);
    }
    const session = await this.openSession.execute({ userId: result.value.userId });
    setSessionCookie(response, session.value.refreshToken, session.value.expiresAt);
    return result.value;
  }

  /**
   * §18 — trade the cookie for a fresh access token.
   *
   * This is what a reload calls. It rotates on every use, so a copy of the
   * cookie stops working the moment the real browser refreshes — and a
   * replayed one kills the whole chain, because from here the copy and the
   * original are indistinguishable.
   *
   * Throttled like a password guess: it IS one, against a 256-bit secret.
   */
  @Post("refresh")
  @HttpCode(200)
  @Throttle(GUESSING_A_SECRET)
  @UseGuards(BrowserOriginGuard)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ accessToken: string; userId: string }> {
    const presented = readSessionCookie(request);
    if (!presented) {
      throw new UnauthorizedException("No session to refresh");
    }
    const result = await this.refreshSession.execute({ presented });
    if (result.isFailure) {
      // The cookie is cleared on every failure, including the theft one: it
      // is dead either way, and leaving it would make the browser retry with
      // it on every load.
      clearSessionCookie(response);
      throw new UnauthorizedException(result.error.message);
    }
    setSessionCookie(response, result.value.refreshToken, result.value.expiresAt);
    return { accessToken: result.value.accessToken, userId: result.value.userId };
  }

  /**
   * Signing out kills the whole chain, not just the cookie presented — a
   * session credential is useful through its successors, and clearing the
   * browser's copy alone would make "sign out" mean "sign out of this tab".
   *
   * No guard beyond the origin: it never says whether it found anything, so
   * there is nothing here to probe with.
   */
  @Post("logout")
  @HttpCode(200)
  @UseGuards(BrowserOriginGuard)
  async logOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true }> {
    const presented = readSessionCookie(request);
    if (presented) {
      await this.closeSession.execute({ presented });
    }
    clearSessionCookie(response);
    return { ok: true };
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
