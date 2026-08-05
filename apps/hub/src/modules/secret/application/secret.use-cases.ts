import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { DomainError } from "../../../kernel/domain/domain-error";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef } from "../../identity/domain/actor";
import {
  SECRET_CIPHER,
  SecretCipher,
} from "../domain/ports/secret-cipher.port";
import {
  SECRET_REPOSITORY,
  SecretRepository,
} from "../domain/ports/secret.repository.port";
import { Secret } from "../domain/secret";

/**
 * §18.4 — a task asked for a secret this workspace does not hold.
 *
 * Named rather than silently skipped: a run that started with half its
 * credentials fails somewhere deep in a provider, with a message about
 * authentication that points nowhere near the missing configuration.
 */
export class MissingSecretsError extends DomainError {
  constructor(names: readonly string[]) {
    super(
      `This workspace holds no secret named ${names.map((name) => `"${name}"`).join(", ")}. ` +
        "A run started without it would fail inside the provider, where the reason is invisible (§18.4)",
    );
  }
}

export interface StoreSecretInput {
  workspaceId: string;
  name: string;
  value: string;
  actor: ActorRef;
}

/**
 * §18.4 — stores or rotates one secret.
 *
 * Rotation replaces on the same name rather than adding a second row: a task
 * resolving this secret between the two must never find nothing, and two rows
 * with one name would make "which one" a question nobody can answer.
 */
@Injectable()
export class StoreSecretUseCase
  implements UseCase<StoreSecretInput, Result<{ rotated: boolean }, GuardViolation>>
{
  constructor(
    @Inject(SECRET_REPOSITORY) private readonly secrets: SecretRepository,
    @Inject(SECRET_CIPHER) private readonly cipher: SecretCipher,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: StoreSecretInput,
  ): Promise<Result<{ rotated: boolean }, GuardViolation>> {
    const now = this.clock.now();
    const sealed = this.cipher.seal(input.value);

    const existing = await this.secrets.findByName(input.workspaceId, input.name);
    if (existing) {
      const rotated = existing.rotate(sealed, now);
      if (rotated.isFailure) {
        return Result.fail(rotated.error);
      }
      await this.secrets.save(existing);
      await flushDomainEvents(existing, this.publisher);
      return Result.ok({ rotated: true });
    }

    const secret = Secret.store({
      workspaceId: input.workspaceId,
      name: input.name,
      sealed,
      createdBy: input.actor,
      now,
    });
    if (secret.isFailure) {
      return Result.fail(secret.error);
    }
    await this.secrets.save(secret.value);
    await flushDomainEvents(secret.value, this.publisher);
    return Result.ok({ rotated: false });
  }
}

export interface ResolveSecretsInput {
  workspaceId: string;
  /** What the task declared it requires (§18.4). */
  names: readonly string[];
  /** Who is asking — recorded, because §18.7 audits secret access. */
  actor: ActorRef;
  reason: string;
}

export type ResolveSecretsError = MissingSecretsError;

/**
 * §18.4 — "Le Runtime fournit uniquement les secrets nécessaires à la tâche,
 * filtrés par ce que l'Extension a explicitement déclaré requérir."
 *
 * This is the only place a plaintext secret exists in the hub, and it exists
 * for the length of one response. It is never stored in a command payload,
 * never journalled, never returned by a read route.
 *
 * **All or nothing.** A missing name is refused rather than skipped: a run
 * that started with half its credentials fails deep inside a provider, and
 * the message it produces is about authentication rather than about the
 * configuration that is actually wrong.
 */
@Injectable()
export class ResolveSecretsUseCase
  implements
    UseCase<ResolveSecretsInput, Result<Record<string, string>, ResolveSecretsError>>
{
  constructor(
    @Inject(SECRET_REPOSITORY) private readonly secrets: SecretRepository,
    @Inject(SECRET_CIPHER) private readonly cipher: SecretCipher,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: ResolveSecretsInput,
  ): Promise<Result<Record<string, string>, ResolveSecretsError>> {
    if (input.names.length === 0) {
      return Result.ok({});
    }

    const found = await this.secrets.findManyByName(input.workspaceId, input.names);
    const missing = input.names.filter(
      (name) => !found.some((secret) => secret.name === name),
    );
    if (missing.length > 0) {
      return Result.fail(new MissingSecretsError(missing));
    }

    const now = this.clock.now();
    const resolved: Record<string, string> = {};
    for (const secret of found) {
      const opened = this.cipher.open(secret.sealed);
      if (opened.isFailure) {
        /**
         * A stored value that will not open is a broken secret, not a missing
         * one, and the distinction matters: one is a configuration mistake,
         * the other is a key rotation gone wrong or a tampered row.
         */
        return Result.fail(new MissingSecretsError([`${secret.name} (unreadable)`]));
      }
      resolved[secret.name] = opened.value;
      secret.noteAccess(input.actor, input.reason, now);
      await this.secrets.save(secret);
      await flushDomainEvents(secret, this.publisher);
    }
    return Result.ok(resolved);
  }
}

export interface DeleteSecretInput {
  workspaceId: string;
  name: string;
}

@Injectable()
export class DeleteSecretUseCase
  implements UseCase<DeleteSecretInput, Result<void, MissingSecretsError>>
{
  constructor(
    @Inject(SECRET_REPOSITORY) private readonly secrets: SecretRepository,
  ) {}

  async execute(input: DeleteSecretInput): Promise<Result<void, MissingSecretsError>> {
    const secret = await this.secrets.findByName(input.workspaceId, input.name);
    if (!secret) {
      return Result.fail(new MissingSecretsError([input.name]));
    }
    /**
     * Physically removed, unlike every other deletion here. A secret's value
     * is the one thing whose history nobody wants kept: a logically deleted
     * credential is a credential still in the table (§4.2's deletion rules,
     * and the exception to them).
     */
    await this.secrets.delete(secret.id.value);
    return Result.ok(undefined);
  }
}
