import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { CredentialNotFoundError } from "../domain/identity.errors";
import {
  ACTOR_CREDENTIAL_REPOSITORY,
  ActorCredentialRepository,
} from "../domain/ports/identity.repository.ports";

export interface RevokeActorCredentialInput {
  credentialId: string;
}

@Injectable()
export class RevokeActorCredentialUseCase
  implements
    UseCase<RevokeActorCredentialInput, Result<void, CredentialNotFoundError>>
{
  constructor(
    @Inject(ACTOR_CREDENTIAL_REPOSITORY)
    private readonly credentials: ActorCredentialRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: RevokeActorCredentialInput,
  ): Promise<Result<void, CredentialNotFoundError>> {
    const credential = await this.credentials.findById(input.credentialId);
    if (!credential) {
      return Result.fail(new CredentialNotFoundError(input.credentialId));
    }

    credential.revoke(this.clock.now());
    await this.credentials.save(credential);
    await flushDomainEvents(credential, this.publisher);
    return Result.ok(undefined);
  }
}
