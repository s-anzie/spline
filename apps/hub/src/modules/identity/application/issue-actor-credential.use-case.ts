import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../domain/actor";
import { ActorCredential } from "../domain/actor-credential";
import { buildActorToken } from "../domain/actor-token";
import { HumanCredentialNotAllowedError } from "../domain/identity.errors";
import {
  ACTOR_CREDENTIAL_REPOSITORY,
  ActorCredentialRepository,
} from "../domain/ports/identity.repository.ports";
import {
  PASSWORD_HASHER,
  PasswordHasher,
  SECRET_GENERATOR,
  SecretGenerator,
} from "../domain/ports/identity.service.ports";

export interface IssueActorCredentialInput {
  actorType: Exclude<ActorType, "HUMAN">;
  actorId: string;
}

export interface IssueActorCredentialOutput {
  /** Shown exactly once — only the hash is stored. */
  token: string;
  credentialId: string;
}

export type IssueActorCredentialError = GuardViolation | HumanCredentialNotAllowedError;

@Injectable()
export class IssueActorCredentialUseCase
  implements
    UseCase<
      IssueActorCredentialInput,
      Result<IssueActorCredentialOutput, IssueActorCredentialError>
    >
{
  constructor(
    @Inject(ACTOR_CREDENTIAL_REPOSITORY)
    private readonly credentials: ActorCredentialRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SECRET_GENERATOR) private readonly secrets: SecretGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: IssueActorCredentialInput,
  ): Promise<Result<IssueActorCredentialOutput, IssueActorCredentialError>> {
    const actor = ActorRef.create(input.actorType, input.actorId);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }

    const secret = this.secrets.generate();
    const tokenHash = await this.hasher.hash(secret);
    const credential = ActorCredential.create({
      actor: actor.value,
      tokenHash,
      now: this.clock.now(),
    });
    if (credential.isFailure) {
      return Result.fail(credential.error);
    }

    await this.credentials.save(credential.value);
    await flushDomainEvents(credential.value, this.publisher);

    return Result.ok({
      token: buildActorToken(input.actorType, credential.value.id.value, secret),
      credentialId: credential.value.id.value,
    });
  }
}
