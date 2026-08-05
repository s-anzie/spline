import { AggregateRoot } from "../../../kernel/domain/aggregate-root";
import { BaseDomainEvent } from "../../../kernel/domain/base-domain-event";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { Result } from "../../../kernel/domain/result";
import { isStale } from "../../../kernel/domain/staleness";
import { StateMachine } from "../../../kernel/domain/state-machine";
import { UniqueEntityId } from "../../../kernel/domain/unique-entity-id";
import { ActorRef } from "../../identity/domain/actor";

/** §4.11 */
export const WORKER_STATUSES = [
  "ONLINE",
  "OFFLINE",
  "DRAINING",
  "MAINTENANCE",
] as const;
export type WorkerStatus = (typeof WORKER_STATUSES)[number];

/**
 * §6.2 gives the runtime's own lifecycle; these are the statuses the Control
 * Plane records (§4.11). DRAINING accepts no new work and finishes what it
 * has; MAINTENANCE is deliberate and does not come back on a heartbeat.
 */
const STATUS_MACHINE = new StateMachine<WorkerStatus>({
  ONLINE: ["DRAINING", "MAINTENANCE", "OFFLINE"],
  DRAINING: ["OFFLINE", "MAINTENANCE"],
  MAINTENANCE: ["ONLINE", "OFFLINE"],
  OFFLINE: ["ONLINE", "MAINTENANCE"],
});

export class WorkerRegistered extends BaseDomainEvent {
  readonly eventName = "runtime.worker_registered";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly hostname: string,
  ) {
    // A machine exists above workspaces: it is attached to them afterwards
    // (§6.3), and may serve several.
    super(aggregateId, occurredAt, null);
  }
}

export class WorkerOffline extends BaseDomainEvent {
  readonly eventName = "runtime.worker_offline";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly hostname: string,
  ) {
    super(aggregateId, occurredAt, null);
  }
}

export class WorkerAttached extends BaseDomainEvent {
  readonly eventName = "runtime.worker_attached";

  constructor(
    aggregateId: string,
    occurredAt: Date,
    workspaceId: string,
    readonly hostname: string,
  ) {
    super(aggregateId, occurredAt, workspaceId);
  }
}

interface WorkerProps {
  hostname: string;
  /**
   * §18 — the actor that registered this machine, and the only one allowed
   * to speak as it afterwards.
   *
   * Every machine route carries the machine's id in its path, and nothing
   * used to tie that id to the caller: any authenticated actor could claim
   * the orders addressed to somebody else's machine — receiving their
   * payloads, and leaving the real machine with nothing, since the orders
   * were already CLAIMED.
   */
  registeredBy: ActorRef;
  labels: string[];
  architecture: string;
  operatingSystem: string;
  capabilities: string[];
  /** §6.3 — the workspaces this machine is allowed to serve. */
  workspaceIds: string[];
  status: WorkerStatus;
  lastHeartbeatAt: Date | null;
  registeredAt: Date;
  updatedAt: Date;
}

export interface RegisterWorkerProps {
  hostname: string;
  registeredBy: ActorRef;
  architecture: string;
  operatingSystem: string;
  capabilities?: readonly string[];
  labels?: readonly string[];
  now: Date;
}

/** §4.11 — an execution machine, as the Control Plane knows it. */
export class WorkerNode extends AggregateRoot<WorkerProps> {
  static register(
    input: RegisterWorkerProps,
    id?: UniqueEntityId,
  ): Result<WorkerNode, GuardViolation> {
    for (const [value, name] of [
      [input.hostname, "hostname"],
      [input.architecture, "architecture"],
      [input.operatingSystem, "operatingSystem"],
    ] as const) {
      const guarded = Guard.againstEmpty(value, name);
      if (guarded.isFailure) {
        return Result.fail(guarded.error);
      }
    }

    const worker = new WorkerNode(
      {
        hostname: input.hostname.trim(),
        registeredBy: input.registeredBy,
        labels: [...(input.labels ?? [])],
        architecture: input.architecture.trim(),
        operatingSystem: input.operatingSystem.trim(),
        capabilities: [...(input.capabilities ?? [])],
        workspaceIds: [],
        status: "ONLINE",
        // Registering IS a heartbeat: a machine that just spoke is not stale.
        lastHeartbeatAt: input.now,
        registeredAt: input.now,
        updatedAt: input.now,
      },
      id,
    );
    worker.addDomainEvent(
      new WorkerRegistered(worker.id.value, input.now, worker.hostname),
    );
    return Result.ok(worker);
  }

  static reconstitute(props: WorkerProps, id: string): WorkerNode {
    return new WorkerNode(props, new UniqueEntityId(id));
  }

  get hostname(): string {
    return this.props.hostname;
  }

  get registeredBy(): ActorRef {
    return this.props.registeredBy;
  }

  /**
   * The one question every machine route has to ask before it acts: is the
   * caller this machine? Compared on both halves of the reference — an agent
   * whose id happens to match a worker's is still not that worker.
   */
  isOperatedBy(actor: ActorRef): boolean {
    return (
      this.props.registeredBy.type === actor.type &&
      this.props.registeredBy.actorId === actor.actorId
    );
  }

  get labels(): readonly string[] {
    return [...this.props.labels];
  }

  get architecture(): string {
    return this.props.architecture;
  }

  get operatingSystem(): string {
    return this.props.operatingSystem;
  }

  get capabilities(): readonly string[] {
    return [...this.props.capabilities];
  }

  get workspaceIds(): readonly string[] {
    return [...this.props.workspaceIds];
  }

  get status(): WorkerStatus {
    return this.props.status;
  }

  get lastHeartbeatAt(): Date | null {
    return this.props.lastHeartbeatAt;
  }

  get registeredAt(): Date {
    return this.props.registeredAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  serves(workspaceId: string): boolean {
    return this.props.workspaceIds.includes(workspaceId);
  }

  /**
   * §17.7 — judged at read, from the last heartbeat, never by a periodic
   * sweep "qui pourrait lui-même retarder". A machine in MAINTENANCE is not
   * stale: nobody expects it to speak.
   */
  isStaleAt(now: Date, ttlMs: number): boolean {
    if (this.props.status === "MAINTENANCE" || this.props.status === "OFFLINE") {
      return false;
    }
    return isStale(this.props.lastHeartbeatAt, ttlMs, now);
  }

  /** §6.4 — and it brings a machine back from OFFLINE, which is the point. */
  heartbeat(now: Date): void {
    this.props.lastHeartbeatAt = now;
    this.props.updatedAt = now;
    if (this.props.status === "OFFLINE") {
      this.props.status = "ONLINE";
    }
  }

  /**
   * §6.3 — the attachment. §18.8 makes this the bootstrap case: the machine
   * does not belong to the workspace yet, which is precisely what this
   * establishes. The workspace authorises it; the machine never does.
   */
  attachTo(workspaceId: string, now: Date): Result<void, GuardViolation> {
    const guarded = Guard.againstEmpty(workspaceId, "workspaceId");
    if (guarded.isFailure) {
      return Result.fail(guarded.error);
    }
    if (!this.props.workspaceIds.includes(guarded.value)) {
      this.props.workspaceIds.push(guarded.value);
      this.props.updatedAt = now;
      this.addDomainEvent(
        new WorkerAttached(this.id.value, now, guarded.value, this.props.hostname),
      );
    }
    return Result.ok(undefined);
  }

  detachFrom(workspaceId: string, now: Date): void {
    this.props.workspaceIds = this.props.workspaceIds.filter(
      (id) => id !== workspaceId,
    );
    this.props.updatedAt = now;
  }

  /** §22.6 semantics throughout — no unhandled exception, ever. */
  changeStatus(
    next: WorkerStatus,
    now: Date,
  ): Result<void, InvalidStateTransitionError> {
    const outcome = STATUS_MACHINE.transition(this.props.status, next);
    switch (outcome.kind) {
      case "alreadyInState":
        return Result.ok(undefined);
      case "invalidTransition":
        return Result.fail(new InvalidStateTransitionError("WorkerNode", outcome));
      case "transitioned":
        this.props.status = outcome.to;
        this.props.updatedAt = now;
        if (outcome.to === "OFFLINE") {
          // §17.9 lists "Worker Offline" among the alerts.
          this.addDomainEvent(
            new WorkerOffline(this.id.value, now, this.props.hostname),
          );
        }
        return Result.ok(undefined);
    }
  }

  allowedStatusTargets(): readonly WorkerStatus[] {
    return STATUS_MACHINE.allowedFrom(this.props.status);
  }
}
