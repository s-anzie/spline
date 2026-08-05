import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { StateMachine } from "../../../kernel/domain/state-machine";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { EnrolmentNotClaimableError } from "./runtime.errors";

export const ENROLMENT_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CLAIMED",
] as const;
export type EnrolmentStatus = (typeof ENROLMENT_STATUSES)[number];

/**
 * How long an unapproved request stays live. Short on purpose: the pairing
 * code is printed on a machine's console, and a code that never expires is a
 * password left on a screen. OpenClaw expires its pending node requests
 * minutes after the last retry, for the same reason.
 */
export const ENROLMENT_TTL_MS = 10 * 60 * 1000;

const STATUS_MACHINE = new StateMachine<EnrolmentStatus>({
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["CLAIMED"],
  REJECTED: [],
  CLAIMED: [],
});

export class EnrolmentRequested extends BaseDomainEvent {
  readonly eventName = "runtime.enrolment_requested";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly hostname: string,
  ) {
    // A machine asking to join belongs to no workspace yet (§6.3), and to no
    // organization either until somebody approves it.
    super(aggregateId, occurredAt, null);
  }
}

export class EnrolmentDecided extends BaseDomainEvent {
  readonly eventName = "runtime.enrolment_decided";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly hostname: string,
    readonly status: EnrolmentStatus,
    readonly decidedBy: string,
  ) {
    super(aggregateId, occurredAt, null);
  }
}

interface EnrolmentProps {
  /**
   * Generated and kept by the machine itself, never by the hub. It is what
   * makes the eventual claim provable: knowing the enrolment id is not
   * enough, you also have to be the machine that asked.
   */
  deviceId: string;
  /**
   * Assigned at APPROVAL, not at request: a machine asking to join has no way
   * to know which organization it is joining, and letting it name one would
   * be letting it choose. The owner who approves is the one who knows.
   */
  organizationId: string | null;
  hostname: string;
  architecture: string;
  operatingSystem: string;
  /**
   * §9.9 — what this machine says it can run. Approving is approving THIS
   * surface: a machine that later grows a capability is asking for work it
   * was never approved to attract, and must ask again.
   */
  capabilities: string[];
  labels: string[];
  /**
   * Shown by the machine on its own console. The operator reading it is the
   * out-of-band factor: approving proves you can see that machine, which no
   * amount of network access gives you.
   */
  code: string;
  status: EnrolmentStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  requestedAt: Date;
}

export interface RequestEnrolmentProps {
  deviceId: string;
  hostname: string;
  architecture: string;
  operatingSystem: string;
  capabilities?: readonly string[];
  labels?: readonly string[];
  code: string;
  now: Date;
}

/**
 * §6.3 and §18.2 — how a machine comes to be trusted.
 *
 * The alternative this replaces was: an operator mints a token in the hub and
 * pastes it into the machine's configuration. That works, and it moves a
 * long-lived secret through a clipboard, a shell history and possibly a
 * message to the other machine — three places it does not belong, multiplied
 * by every machine an operator owns.
 *
 * Here the machine generates its own identity, prints a short-lived code on
 * its own console, and an operator approves that code. The credential is
 * minted at CLAIM, not at approval, so no plaintext token ever waits at rest.
 * The operator never sees the secret; the machine never receives one it did
 * not ask for.
 */
export class WorkerEnrolment extends AggregateRoot<EnrolmentProps> {
  static request(
    input: RequestEnrolmentProps,
    id?: UniqueEntityId,
  ): Result<WorkerEnrolment, GuardViolation> {
    for (const [value, name] of [
      [input.deviceId, "deviceId"],
      [input.hostname, "hostname"],
      [input.architecture, "architecture"],
      [input.operatingSystem, "operatingSystem"],
      [input.code, "code"],
    ] as const) {
      const guarded = Guard.againstEmpty(value, name);
      if (guarded.isFailure) {
        return Result.fail(guarded.error);
      }
    }

    const enrolment = new WorkerEnrolment(
      {
        deviceId: input.deviceId.trim(),
        organizationId: null,
        hostname: input.hostname.trim(),
        architecture: input.architecture.trim(),
        operatingSystem: input.operatingSystem.trim(),
        capabilities: [...(input.capabilities ?? [])],
        labels: [...(input.labels ?? [])],
        code: input.code,
        status: "PENDING",
        decidedBy: null,
        decidedAt: null,
        requestedAt: input.now,
      },
      id,
    );
    enrolment.addDomainEvent(
      new EnrolmentRequested(enrolment.id.value, input.now, enrolment.hostname),
    );
    return Result.ok(enrolment);
  }

  static reconstitute(props: EnrolmentProps, id: string): WorkerEnrolment {
    return new WorkerEnrolment(props, new UniqueEntityId(id));
  }

  get deviceId(): string {
    return this.props.deviceId;
  }

  get organizationId(): string | null {
    return this.props.organizationId;
  }

  get hostname(): string {
    return this.props.hostname;
  }

  get architecture(): string {
    return this.props.architecture;
  }

  get operatingSystem(): string {
    return this.props.operatingSystem;
  }

  get capabilities(): readonly string[] {
    return this.props.capabilities;
  }

  get labels(): readonly string[] {
    return this.props.labels;
  }

  get code(): string {
    return this.props.code;
  }

  get status(): EnrolmentStatus {
    return this.props.status;
  }

  get decidedBy(): string | null {
    return this.props.decidedBy;
  }

  get decidedAt(): Date | null {
    return this.props.decidedAt;
  }

  get requestedAt(): Date {
    return this.props.requestedAt;
  }

  /** Judged at read, like every other staleness in this system (§17.7). */
  hasExpiredAt(now: Date): boolean {
    return (
      this.props.status === "PENDING" &&
      now.getTime() - this.props.requestedAt.getTime() >= ENROLMENT_TTL_MS
    );
  }

  /**
   * §9.9 — approving approves a capability surface. A machine that comes back
   * claiming more than it was approved for is not the machine that was
   * approved, and has to ask again.
   */
  covers(capabilities: readonly string[]): boolean {
    return capabilities.every((capability) =>
      this.props.capabilities.includes(capability),
    );
  }

  /** Approving is also the act that says which organization this machine joins. */
  approve(
    organizationId: string,
    decidedBy: string,
    now: Date,
  ): Result<void, InvalidStateTransitionError | EnrolmentNotClaimableError> {
    if (this.hasExpiredAt(now)) {
      return Result.fail(
        new EnrolmentNotClaimableError("this pairing code has expired"),
      );
    }
    const decided = this.decide("APPROVED", decidedBy, now);
    if (decided.isSuccess) {
      this.props.organizationId = organizationId;
    }
    return decided;
  }

  reject(
    decidedBy: string,
    now: Date,
  ): Result<void, InvalidStateTransitionError | EnrolmentNotClaimableError> {
    return this.decide("REJECTED", decidedBy, now);
  }

  /**
   * The moment a credential is minted. Two conditions, and both matter: the
   * request was approved, and the caller is the machine that made it.
   */
  claim(
    deviceId: string,
    now: Date,
  ): Result<void, InvalidStateTransitionError | EnrolmentNotClaimableError> {
    if (this.props.deviceId !== deviceId) {
      return Result.fail(
        new EnrolmentNotClaimableError("this enrolment belongs to another machine"),
      );
    }
    if (this.props.status !== "APPROVED") {
      return Result.fail(
        new EnrolmentNotClaimableError(
          `an enrolment is claimed once, after approval — this one is ${this.props.status}`,
        ),
      );
    }
    const moved = this.transition("CLAIMED");
    if (moved.isFailure) {
      return moved;
    }
    void now;
    return Result.ok(undefined);
  }

  allowedStatusTargets(): readonly EnrolmentStatus[] {
    return STATUS_MACHINE.allowedFrom(this.props.status);
  }

  private decide(
    next: EnrolmentStatus,
    decidedBy: string,
    now: Date,
  ): Result<void, InvalidStateTransitionError | EnrolmentNotClaimableError> {
    if (this.props.status !== "PENDING") {
      return Result.fail(
        new EnrolmentNotClaimableError(
          `this request was already ${this.props.status.toLowerCase()}`,
        ),
      );
    }
    const moved = this.transition(next);
    if (moved.isFailure) {
      return moved;
    }
    this.props.decidedBy = decidedBy;
    this.props.decidedAt = now;
    this.addDomainEvent(
      new EnrolmentDecided(this.id.value, now, this.props.hostname, next, decidedBy),
    );
    return Result.ok(undefined);
  }

  private transition(next: EnrolmentStatus): Result<void, InvalidStateTransitionError> {
    const outcome = STATUS_MACHINE.transition(this.props.status, next);
    switch (outcome.kind) {
      case "alreadyInState":
        return Result.ok(undefined);
      case "invalidTransition":
        return Result.fail(new InvalidStateTransitionError("WorkerEnrolment", outcome));
      case "transitioned":
        this.props.status = outcome.to;
        return Result.ok(undefined);
    }
  }
}
