import { plainToInstance } from "class-transformer";
import {
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from "class-validator";

/**
 * A signing key is only as strong as its length, and "not empty" accepted
 * `JWT_SECRET=x`. 32 characters is the floor below which a key is guessable
 * offline; the shipped .env.example generates far more (§18).
 */
const MINIMUM_KEY_LENGTH = 32;

class EnvironmentVariables {
  @IsNumberString()
  PORT!: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL_TEST!: string;

  @IsString()
  @MinLength(MINIMUM_KEY_LENGTH)
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN!: string;

  /**
   * Separate from JWT_SECRET on purpose: one key signs sessions, the other
   * makes the audit trail's tampering detectable (§4.23). Rotating or leaking
   * one must not compromise the other.
   */
  @IsString()
  @MinLength(MINIMUM_KEY_LENGTH)
  AUDIT_SIGNING_KEY!: string;

  /**
   * Comma-separated list of browser origins allowed to call this API. Absent
   * means none — a worker and a server-side client send no Origin and are
   * unaffected, so the safe default costs nothing until a UI needs listing.
   */
  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  /**
   * The interface to listen on. Absent means loopback — reaching the hub from
   * another machine is a decision an operator makes on purpose (§18).
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  LISTEN_HOST?: string;

  /** Rate limits and body ceiling: see config/hardening.ts and bootstrap.ts. */
  @IsOptional()
  @IsNumberString()
  THROTTLE_TTL_MS?: string;

  @IsOptional()
  @IsNumberString()
  THROTTLE_LIMIT?: string;

  @IsOptional()
  @IsNumberString()
  AUTH_THROTTLE_LIMIT?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  BODY_LIMIT?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.toString()}`);
  }

  return validated;
}
