import { Inject, Injectable } from "@nestjs/common";

import { flushDomainEvents } from "../../../kernel/application/flush-domain-events";
import { UseCase } from "../../../kernel/application/use-case";
import { InvalidStateTransitionError } from "../../../kernel/domain/errors";
import { Guard, GuardViolation } from "../../../kernel/domain/guard";
import { CLOCK, Clock } from "../../../kernel/domain/ports/clock.port";
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from "../../../kernel/domain/ports/event-publisher.port";
import { Result } from "../../../kernel/domain/result";
import { ActorRef, ActorType } from "../../identity/domain/actor";
import {
  WORKSPACE_REPOSITORY,
  WorkspaceRepository,
} from "../../workspace/domain/ports/workspace.repository.port";
import { WorkspaceNotFoundError } from "../../workspace/domain/workspace.errors";
import { AgentSession, SessionStatus } from "../domain/agent-session";
import { ProviderProfile } from "../domain/provider-profile";
import {
  PROVIDER_STORE,
  ProviderStore,
  SESSION_STORE,
  SessionStore,
  WORKER_STORE,
  WorkerStore,
} from "../domain/ports/runtime.repository.port";
import {
  ProviderUnavailableError,
  SessionNotFoundError,
  WorkerImpersonationError,
  WorkerNotAttachedError,
  WorkerNotFoundError,
} from "../domain/runtime.errors";
import { WorkerNode, WorkerStatus } from "../domain/worker-node";

export interface RegisterWorkerInput {
  hostname: string;
  /** §18 — the actor announcing it, and the only one that may speak as it. */
  registeredBy: ActorRef;
  architecture: string;
  operatingSystem: string;
  capabilities?: readonly string[];
  labels?: readonly string[];
}

/**
 * §6.3 — a machine announces itself, and the Control Plane answers with its
 * id. Registering is deliberately NOT a workspace action: the machine has no
 * workspace yet, which is exactly what attaching establishes afterwards.
 *
 * Re-registering the same hostname returns the same machine rather than a
 * second one. A worker that restarts is the same worker, and letting it
 * multiply would leave phantom machines that never speak again — which the
 * staleness probe would then dutifully report forever.
 */
@Injectable()
export class RegisterWorkerUseCase
  implements
    UseCase<
      RegisterWorkerInput,
      Result<{ workerId: string }, GuardViolation | WorkerImpersonationError>
    >
{
  constructor(
    @Inject(WORKER_STORE) private readonly workers: WorkerStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: RegisterWorkerInput,
  ): Promise<Result<{ workerId: string }, GuardViolation | WorkerImpersonationError>> {
    const now = this.clock.now();
    const existing = await this.workers.findByHostname(input.hostname.trim());
    if (existing) {
      // §18 — registration upserts by hostname, so announcing an existing
      // machine's hostname used to hand back that machine's id: a takeover in
      // one call. A restart is the same actor and still succeeds.
      if (!existing.isOperatedBy(input.registeredBy)) {
        return Result.fail(new WorkerImpersonationError(existing.hostname));
      }
      existing.heartbeat(now);
      await this.workers.save(existing);
      await flushDomainEvents(existing, this.publisher);
      return Result.ok({ workerId: existing.id.value });
    }

    const worker = WorkerNode.register({ ...input, now });
    if (worker.isFailure) {
      return Result.fail(worker.error);
    }
    await this.workers.save(worker.value);
    await flushDomainEvents(worker.value, this.publisher);
    return Result.ok({ workerId: worker.value.id.value });
  }
}

export interface AttachWorkerInput {
  workspaceId: string;
  workerId: string;
  attach: boolean;
}

/**
 * §6.3 and §18.8 — THE bootstrap exception, and this comment sits where §18.8
 * asks it to: "documentée au même endroit que la vérification qu'elle
 * contourne".
 *
 * The generic check everywhere else in this codebase is "does this resource
 * belong to the caller's workspace?". Applied here it fails by construction:
 * the machine does not belong to the workspace, and this action is what makes
 * it belong. The lesson is recorded in the spec because the check really did
 * make workspace attachment impossible (0.3.2).
 *
 * The exception is narrow and named, never a hole: authorisation comes from
 * the WORKSPACE side — the caller must hold `manage_machines` in the
 * workspace, which the route enforces. What is skipped is only the check that
 * the *machine* already belongs there. The workspace still authorises; the
 * machine never does.
 */
@Injectable()
export class AttachWorkerUseCase
  implements
    UseCase<AttachWorkerInput, Result<void, WorkerNotFoundError | GuardViolation>>
{
  constructor(
    @Inject(WORKER_STORE) private readonly workers: WorkerStore,
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: AttachWorkerInput,
  ): Promise<Result<void, WorkerNotFoundError | GuardViolation | WorkspaceNotFoundError>> {
    const workspace = await this.workspaces.findById(input.workspaceId);
    if (!workspace) {
      return Result.fail(new WorkspaceNotFoundError(input.workspaceId));
    }
    const worker = await this.workers.findById(input.workerId);
    // Deliberately NOT `worker.serves(workspaceId)`: see the class comment.
    if (!worker) {
      return Result.fail(new WorkerNotFoundError(input.workerId));
    }

    const now = this.clock.now();
    if (input.attach) {
      const attached = worker.attachTo(input.workspaceId, now);
      if (attached.isFailure) {
        return Result.fail(attached.error);
      }
    } else {
      worker.detachFrom(input.workspaceId, now);
    }
    await this.workers.save(worker);
    await flushDomainEvents(worker, this.publisher);
    return Result.ok(undefined);
  }
}

export interface WorkerHeartbeatInput {
  workerId: string;
  /** §18 — the caller, which must be the machine it claims to be. */
  actor: ActorRef;
  status?: WorkerStatus;
}

/** §6.4 — the machine says it is there; the hub judges whether that is recent. */
@Injectable()
export class WorkerHeartbeatUseCase
  implements
    UseCase<
      WorkerHeartbeatInput,
      Result<
        void,
        WorkerNotFoundError | WorkerImpersonationError | InvalidStateTransitionError
      >
    >
{
  constructor(
    @Inject(WORKER_STORE) private readonly workers: WorkerStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: WorkerHeartbeatInput,
  ): Promise<
    Result<
      void,
      WorkerNotFoundError | WorkerImpersonationError | InvalidStateTransitionError
    >
  > {
    const worker = await this.workers.findById(input.workerId);
    if (!worker) {
      return Result.fail(new WorkerNotFoundError(input.workerId));
    }
    if (!worker.isOperatedBy(input.actor)) {
      return Result.fail(new WorkerImpersonationError(worker.hostname));
    }

    const now = this.clock.now();
    worker.heartbeat(now);
    if (input.status) {
      const changed = worker.changeStatus(input.status, now);
      if (changed.isFailure) {
        return Result.fail(changed.error);
      }
    }
    await this.workers.save(worker);
    await flushDomainEvents(worker, this.publisher);
    return Result.ok(undefined);
  }
}

export interface StartSessionInput {
  workspaceId: string;
  workerId: string;
  agentType: ActorType;
  agentId: string;
  provider: string;
  model?: string;
  taskId?: string;
}

export type StartSessionError =
  | GuardViolation
  | WorkerNotFoundError
  | WorkerNotAttachedError
  | ProviderUnavailableError;

/** §7.1 — starting a session, with the two refusals that protect the system. */
@Injectable()
export class StartSessionUseCase
  implements UseCase<StartSessionInput, Result<{ sessionId: string }, StartSessionError>>
{
  constructor(
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(WORKER_STORE) private readonly workers: WorkerStore,
    @Inject(PROVIDER_STORE) private readonly providers: ProviderStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: StartSessionInput,
  ): Promise<Result<{ sessionId: string }, StartSessionError>> {
    const worker = await this.workers.findById(input.workerId);
    if (!worker) {
      return Result.fail(new WorkerNotFoundError(input.workerId));
    }
    // §6.10 — "le Runtime ne reçoit jamais les tâches étrangères". Here that
    // is not a bootstrap case: the attachment already exists or it does not.
    if (!worker.serves(input.workspaceId)) {
      return Result.fail(
        new WorkerNotAttachedError(worker.hostname, input.workspaceId),
      );
    }

    const now = this.clock.now();
    const profile = await this.providers.findByProvider(input.provider);
    // §4.14 — a provider out of quota takes no new work, and the refusal
    // carries the reason that was recorded when it was locked out.
    if (profile && !profile.isAvailableAt(now)) {
      return Result.fail(
        new ProviderUnavailableError(input.provider, profile.quotaReason),
      );
    }

    const agent = ActorRef.create(input.agentType, input.agentId);
    if (agent.isFailure) {
      return Result.fail(agent.error);
    }
    const session = AgentSession.start({
      workspaceId: input.workspaceId,
      agent: agent.value,
      workerId: worker.id.value,
      provider: input.provider,
      model: input.model,
      taskId: input.taskId,
      now,
    });
    if (session.isFailure) {
      return Result.fail(session.error);
    }

    await this.sessions.save(session.value);
    await flushDomainEvents(session.value, this.publisher);
    return Result.ok({ sessionId: session.value.id.value });
  }
}

export interface AdvanceSessionInput {
  workspaceId: string;
  sessionId: string;
  status?: SessionStatus;
  reason?: string;
}

/** §4.12's invariant is the aggregate's; this only carries it to the edge. */
@Injectable()
export class AdvanceSessionUseCase
  implements
    UseCase<
      AdvanceSessionInput,
      Result<void, SessionNotFoundError | InvalidStateTransitionError>
    >
{
  constructor(
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: AdvanceSessionInput,
  ): Promise<Result<void, SessionNotFoundError | InvalidStateTransitionError>> {
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.workspaceId !== input.workspaceId) {
      return Result.fail(new SessionNotFoundError(input.sessionId));
    }

    const now = this.clock.now();
    session.heartbeat(now);
    if (input.status) {
      const changed = session.changeStatus(input.status, now, input.reason);
      if (changed.isFailure) {
        return Result.fail(changed.error);
      }
    }
    await this.sessions.save(session);
    await flushDomainEvents(session, this.publisher);
    return Result.ok(undefined);
  }
}

export interface SetProviderAvailabilityInput {
  provider: string;
  action: "RESTORE" | "DISABLE" | "QUOTA_EXHAUSTED";
  until?: Date;
  reason?: string;
  actorType: ActorType;
  actorId: string;
}

/**
 * §4.14 — availability is changed by explicit, attributed acts, never
 * deduced. §7.15 forbids inferring a provider failure from anything an agent
 * wrote, and the surest way to honour that is to have no inference at all:
 * nothing here reads agent output, so an agent writing "429" in its code can
 * lock nobody out.
 */
@Injectable()
export class SetProviderAvailabilityUseCase
  implements
    UseCase<SetProviderAvailabilityInput, Result<void, GuardViolation | Error>>
{
  constructor(
    @Inject(PROVIDER_STORE) private readonly providers: ProviderStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async execute(
    input: SetProviderAvailabilityInput,
  ): Promise<Result<void, GuardViolation | Error>> {
    const guarded = Guard.againstEmpty(input.provider, "provider");
    if (guarded.isFailure) {
      return Result.fail(guarded.error);
    }
    const actor = ActorRef.create(input.actorType, input.actorId);
    if (actor.isFailure) {
      return Result.fail(actor.error);
    }

    const now = this.clock.now();
    let profile = await this.providers.findByProvider(guarded.value);
    if (!profile) {
      const registered = ProviderProfile.register({ provider: guarded.value, now });
      if (registered.isFailure) {
        return Result.fail(registered.error);
      }
      profile = registered.value;
    }

    switch (input.action) {
      case "RESTORE":
        profile.restore(actor.value, now);
        break;
      case "DISABLE":
        profile.disable(actor.value, now);
        break;
      case "QUOTA_EXHAUSTED": {
        if (!input.until) {
          return Result.fail(
            new GuardViolation("until", "is required to record a quota window"),
          );
        }
        const marked = profile.markQuotaExhausted(
          input.until,
          input.reason ?? "",
          now,
        );
        if (marked.isFailure) {
          return Result.fail(marked.error);
        }
        break;
      }
    }

    await this.providers.save(profile);
    await flushDomainEvents(profile, this.publisher);
    return Result.ok(undefined);
  }
}
