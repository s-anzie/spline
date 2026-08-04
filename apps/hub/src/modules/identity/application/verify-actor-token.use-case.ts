import { Inject, Injectable } from "@nestjs/common";

import { UseCase } from "../../../kernel/application/use-case";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef } from "../domain/actor";
import { parseActorToken } from "../domain/actor-token";
import {
  CredentialNotFoundError,
  CredentialRevokedError,
  InvalidCredentialsError,
  MalformedActorTokenError,
} from "../domain/identity.errors";
import {
  ACTOR_CREDENTIAL_REPOSITORY,
  ActorCredentialRepository,
} from "../domain/ports/identity.repository.ports";
import {
  PASSWORD_HASHER,
  PasswordHasher,
} from "../domain/ports/identity.service.ports";

export interface VerifyActorTokenInput {
  token: string;
}

export interface VerifyActorTokenOutput {
  actor: ActorRef;
  credentialId: string;
}

export type VerifyActorTokenError =
  | MalformedActorTokenError
  | CredentialNotFoundError
  | CredentialRevokedError
  | InvalidCredentialsError;

/** The authentication path for every non-human actor (gateways, guards). */
@Injectable()
export class VerifyActorTokenUseCase
  implements
    UseCase<VerifyActorTokenInput, Result<VerifyActorTokenOutput, VerifyActorTokenError>>
{
  constructor(
    @Inject(ACTOR_CREDENTIAL_REPOSITORY)
    private readonly credentials: ActorCredentialRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    input: VerifyActorTokenInput,
  ): Promise<Result<VerifyActorTokenOutput, VerifyActorTokenError>> {
    const parsed = parseActorToken(input.token);
    if (parsed.isFailure) {
      return Result.fail(parsed.error);
    }

    const credential = await this.credentials.findById(parsed.value.credentialId);
    if (!credential) {
      return Result.fail(new CredentialNotFoundError(parsed.value.credentialId));
    }
    if (credential.isRevoked) {
      return Result.fail(new CredentialRevokedError());
    }
    const matches = await this.hasher.compare(parsed.value.secret, credential.tokenHash);
    if (!matches) {
      return Result.fail(new InvalidCredentialsError());
    }

    credential.touch(this.clock.now());
    await this.credentials.save(credential);

    return Result.ok({ actor: credential.actor, credentialId: credential.id.value });
  }
}
