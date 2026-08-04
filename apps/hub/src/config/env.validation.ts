import { plainToInstance } from "class-transformer";
import { IsNotEmpty, IsNumberString, IsString, validateSync } from "class-validator";

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
  @IsNotEmpty()
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
  @IsNotEmpty()
  AUDIT_SIGNING_KEY!: string;
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
