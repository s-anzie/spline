import { randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { IssueActorCredentialUseCase } from "../../identity/application/issue-actor-credential.use-case";
import {
  ENROLMENT_STORE,
  EnrolmentStore,
} from "../domain/ports/runtime.repository.port";
import {
  EnrolmentNotClaimableError,
  EnrolmentNotFoundError,
  EnrolmentNotYoursError,
} from "../domain/runtime.errors";
import { WorkerEnrolment } from "../domain/worker-enrolment";

/**
 * Crockford's base32 without I, L, O and U: a code is read off one screen and
 * typed into another, and those four are the characters that get read wrong.
 * 8 characters of a 32-letter alphabet is 40 bits — far beyond guessing
 * inside a ten-minute window, especially rate-limited.
 */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 8;

function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join(
    "",
  );
}

export interface RequestEnrolmentInput {
  deviceId: string;
  /** §18 — the organization this machine was configured to knock for. */
  organizationId?: string;
  hostname: string;
  architecture: string;
  operatingSystem: string;
  capabilities?: readonly string[];
  labels?: readonly string[];
}

export interface RequestEnrolmentOutput {
  enrolmentId: string;
  /** Printed by the machine on its own console, for an operator to read. */
  code: string;
  expiresAt: string;
}

/**
 * §6.3 — a machine asks to join. It is not authenticated, because it has
 * nothing to authenticate with yet: that is the whole point of pairing, and
 * why the route is rate-limited instead.
 */
@Injectable()
export class RequestEnrolmentUseCase
  implements
    UseCase<RequestEnrolmentInput, Result<RequestEnrolmentOutput, GuardViolation>>
{
  constructor(
    @Inject(ENROLMENT_STORE) private readonly enrolments: EnrolmentStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: RequestEnrolmentInput,
  ): Promise<Result<RequestEnrolmentOutput, GuardViolation>> {
    const now = this.clock.now();
    const enrolment = WorkerEnrolment.request({
      ...input,
      // The machine's declaration, kept apart from `organizationId`, which is
      // what it ends up JOINING once somebody approves it.
      requestedOrganizationId: input.organizationId ?? null,
      code: generateCode(),
      now,
    });
    if (enrolment.isFailure) {
      return Result.fail(enrolment.error);
    }

    await this.enrolments.save(enrolment.value);
    await flushDomainEvents(enrolment.value, this.publisher);
    return Result.ok({
      enrolmentId: enrolment.value.id.value,
      code: enrolment.value.code,
      expiresAt: new Date(now.getTime() + ENROLMENT_WINDOW_MS).toISOString(),
    });
  }
}

/** Mirrors the aggregate's own TTL, exposed so a machine can say when to retry. */
const ENROLMENT_WINDOW_MS = 10 * 60 * 1000;

export interface DecideEnrolmentInput {
  code: string;
  organizationId: string;
  decidedBy: string;
  approve: boolean;
}

export type DecideEnrolmentError =
  | EnrolmentNotFoundError
  | EnrolmentNotYoursError
  | EnrolmentNotClaimableError
  | InvalidStateTransitionError;

/**
 * §6.3 — the operator's act, and the one that binds a machine to an
 * organization. Approving by CODE rather than by id is deliberate: the code
 * was printed on that machine's console, so approving proves the operator can
 * see the machine — an out-of-band factor no amount of network access gives.
 */
@Injectable()
export class DecideEnrolmentUseCase
  implements UseCase<DecideEnrolmentInput, Result<{ hostname: string }, DecideEnrolmentError>>
{
  constructor(
    @Inject(ENROLMENT_STORE) private readonly enrolments: EnrolmentStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: DecideEnrolmentInput,
  ): Promise<Result<{ hostname: string }, DecideEnrolmentError>> {
    const enrolment = await this.enrolments.findByCode(input.code.trim().toUpperCase());
    if (!enrolment) {
      return Result.fail(new EnrolmentNotFoundError(input.code));
    }

    /**
     * §18 — a request that named an organization may only be decided by that
     * one. Checked before the aggregate is touched, so a refusal leaves
     * nothing half-changed.
     */
    if (!enrolment.wasKnockingFor(input.organizationId)) {
      return Result.fail(new EnrolmentNotYoursError());
    }

    const now = this.clock.now();
    const decided = input.approve
      ? enrolment.approve(input.organizationId, input.decidedBy, now)
      : enrolment.reject(input.decidedBy, now);
    if (decided.isFailure) {
      return Result.fail(decided.error);
    }

    await this.enrolments.save(enrolment);
    await flushDomainEvents(enrolment, this.publisher);
    return Result.ok({ hostname: enrolment.hostname });
  }
}

export interface ClaimEnrolmentInput {
  enrolmentId: string;
  deviceId: string;
}

export interface ClaimEnrolmentOutput {
  /** Handed over exactly once. Only its hash is kept. */
  token: string;
  credentialId: string;
  actorId: string;
  organizationId: string;
}

export type ClaimEnrolmentError =
  | EnrolmentNotFoundError
  | EnrolmentNotClaimableError
  | GuardViolation
  | InvalidStateTransitionError;

/**
 * §18.2 — where the credential is finally minted.
 *
 * At claim, never at approval: minting on approval would leave a plaintext
 * token sitting in a row waiting for its machine to come and get it, and a
 * secret at rest is a secret somebody reads. Here it exists for the length of
 * one response.
 *
 * The actor id is generated here too, and never accepted from anyone. A
 * caller that could name the actor could mint a credential for an existing
 * one — the scope-escalation class (§18.10).
 */
@Injectable()
export class ClaimEnrolmentUseCase
  implements
    UseCase<ClaimEnrolmentInput, Result<ClaimEnrolmentOutput, ClaimEnrolmentError>>
{
  constructor(
    @Inject(ENROLMENT_STORE) private readonly enrolments: EnrolmentStore,
    private readonly issueCredential: IssueActorCredentialUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: ClaimEnrolmentInput,
  ): Promise<Result<ClaimEnrolmentOutput, ClaimEnrolmentError>> {
    const enrolment = await this.enrolments.findById(input.enrolmentId);
    if (!enrolment) {
      return Result.fail(new EnrolmentNotFoundError(input.enrolmentId));
    }

    const claimed = enrolment.claim(input.deviceId, this.clock.now());
    if (claimed.isFailure) {
      return Result.fail(claimed.error);
    }
    // Approval assigned it; the state machine guarantees we are past approval.
    const organizationId = enrolment.organizationId as string;

    const issued = await this.issueCredential.execute({
      actorType: "WORKER",
      // The hub names the actor. Nobody else ever does (§18.10).
      actorId: enrolment.id.value,
      organizationId,
      displayName: enrolment.hostname,
    });
    if (issued.isFailure) {
      return Result.fail(issued.error);
    }

    await this.enrolments.save(enrolment);
    await flushDomainEvents(enrolment, this.publisher);
    return Result.ok({
      token: issued.value.token,
      credentialId: issued.value.credentialId,
      actorId: enrolment.id.value,
      organizationId,
    });
  }
}
