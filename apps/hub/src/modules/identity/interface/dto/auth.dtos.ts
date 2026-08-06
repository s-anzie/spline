import { IsNotEmpty, IsString, MaxLength } from "class-validator";

/**
 * The ceilings here are not the password policy — that lives in
 * `RegisterUserUseCase` (12 characters minimum), where it belongs, because a
 * rule about what a password may be is a rule of the domain, not of HTTP.
 *
 * What the edge owes is an upper bound. Without one, a display name of a
 * hundred thousand characters is stored and rendered forever; the body limit
 * stops the extreme case, these stop the ordinary one (§18).
 */
const MAX_EMAIL_LENGTH = 254; // RFC 5321's ceiling on an address
const MAX_PASSWORD_LENGTH = 256; // bcrypt reads 72 bytes; past this is noise
const MAX_DISPLAY_NAME_LENGTH = 120;

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_DISPLAY_NAME_LENGTH)
  displayName!: string;
}

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;
}

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  displayName!: string;
}
