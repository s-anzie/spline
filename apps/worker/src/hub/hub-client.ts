import { arch, platform } from "node:os";

import { WorkerConfig } from "../config/config";
import {
  ClaimOutcome,
  EnrolmentRequest,
  EnrolmentTicket,
  PairingHub,
} from "../enrolment/pairing";
import { ProviderFailure } from "../supervision/failure-detector";

export interface ClaimedCommand {
  id: string;
  workspaceId: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface Capabilities {
  capabilities: string[];
  labels: string[];
  /**
   * §7.4 — the agent CLIs this machine can actually drive, which is a
   * different list from what it merely HAS.
   *
   * The hub builds its provider catalogue from this, and it has to be
   * separate from `capabilities`: a machine announcing "docker" and "node"
   * has capabilities, not providers, and a hub that treated them the same
   * would dispatch a task to `docker` and have the machine refuse it. This
   * machine is the only honest authority on the question — it holds the
   * specs, and it knows what the operator allowed it to spawn.
   */
  providers: string[];
}

/**
 * The worker's only way to talk to the hub, and deliberately thin: §6.9 makes
 * the Control Plane authoritative, so this never decides anything — it says
 * what happened and does what it is told.
 */
export class HubClient implements PairingHub {
  private workerId: string | null = null;
  /**
   * Set once this machine has been paired. Held here rather than read from
   * config on every call because pairing happens after config is loaded — a
   * machine's first run has no token at all.
   */
  private token: string | null;

  constructor(private readonly config: WorkerConfig) {
    this.token = config.token;
  }

  get id(): string | null {
    return this.workerId;
  }

  useToken(token: string): void {
    this.token = token;
  }

  /**
   * §6.3 — the two calls a machine makes before it has anything to
   * authenticate with. Unauthenticated by necessity, and they grant nothing:
   * the request only creates a pending record, and the claim needs both the
   * enrolment id and the deviceId this machine kept.
   */
  async requestEnrolment(request: EnrolmentRequest): Promise<EnrolmentTicket> {
    return this.call<EnrolmentTicket>("POST", "/runtime/enrolments", request, {
      anonymous: true,
    });
  }

  async claimEnrolment(enrolmentId: string, deviceId: string): Promise<ClaimOutcome> {
    const response = await this.send(
      "POST",
      `/runtime/enrolments/${enrolmentId}/claim`,
      { deviceId },
      { anonymous: true },
    );
    if (response.ok) {
      const body = (await response.json()) as { token: string; actorId: string };
      return { status: "approved", ...body };
    }
    /**
     * 409 is "not decided yet, or decided against" — the hub deliberately
     * does not distinguish waiting from refused on this route, so the machine
     * reads its own state from what it can see: a request it made and that is
     * not claimable. Treated as pending, and the expiry loop ends the wait.
     */
    if (response.status === 409) {
      return { status: "pending" };
    }
    throw new Error(
      `claiming the enrolment failed: ${response.status} ${await response.text()}`,
    );
  }

  /** §6.3 — the machine announces what it is; the hub answers with its id. */
  async register(capabilities: Capabilities): Promise<string> {
    const body = await this.call<{ workerId: string }>("POST", "/runtime/workers", {
      hostname: this.config.hostname,
      architecture: arch(),
      operatingSystem: platform(),
      capabilities: capabilities.capabilities,
      labels: capabilities.labels,
      providers: capabilities.providers,
    });
    this.workerId = body.workerId;
    return body.workerId;
  }

  /** §6.4 — "je suis là". The hub decides whether that is recent enough. */
  async heartbeat(): Promise<void> {
    if (!this.workerId) {
      throw new Error("cannot send a heartbeat before registering");
    }
    await this.call("POST", `/runtime/workers/${this.workerId}/heartbeat`, {});
  }

  /**
   * §4.14 / §7.15 — reports what a PROCESS said, never what an agent wrote.
   * The evidence travels with it because the hub refuses a lockout it cannot
   * explain, and refuses to invent a window it was not given.
   */
  async reportProviderFailure(
    provider: string,
    failure: ProviderFailure,
  ): Promise<void> {
    if (failure.retryAfterSeconds === null) {
      // No window means no lockout: the hub would have to guess one, and
      // §4.14 refuses that. Reported as an event, not as an availability
      // change — a human decides (§4.14 makes a lockout account-wide).
      return;
    }
    await this.call("POST", `/runtime/providers/${provider}/availability`, {
      action: "QUOTA_EXHAUSTED",
      until: new Date(Date.now() + failure.retryAfterSeconds * 1000).toISOString(),
      reason: `${failure.channel}: ${failure.evidence}`,
    });
  }

  /**
   * §6.8 — the worker PULLS. Doubles as a heartbeat on the hub side, so a
   * busy worker asking for its next order never looks silent.
   */
  async claimCommands(max = 5): Promise<ClaimedCommand[]> {
    if (!this.workerId) {
      throw new Error("cannot claim commands before registering");
    }
    return this.call<ClaimedCommand[]>(
      "POST",
      `/runtime/workers/${this.workerId}/commands/claim`,
      { max },
    );
  }

  /**
   * §18.4 — the credentials this order declared, asked for while holding it.
   *
   * Fetched at execution time rather than carried in the order: a secret in a
   * command payload is a secret in the database, in every backup, and in
   * whatever reads the queue. Here it exists for the length of one response
   * and goes straight into the child process's environment.
   */
  async commandSecrets(commandId: string): Promise<Record<string, string>> {
    if (!this.workerId) {
      throw new Error("cannot resolve secrets before registering");
    }
    return this.call<Record<string, string>>(
      "POST",
      `/runtime/workers/${this.workerId}/commands/${commandId}/secrets`,
      {},
    );
  }

  /**
   * §10, §18.10 — the credential this order's agent acts with, asked for
   * while holding the order. Same lifetime as the secrets: it exists for the
   * length of the run, never in the order and never on disk except inside a
   * 0600 config the agent's own tools read.
   */
  async commandGrant(
    commandId: string,
  ): Promise<{ token: string; scopes: string[]; expiresAt: string }> {
    if (!this.workerId) {
      throw new Error("cannot obtain a grant before registering");
    }
    return this.call(
      "POST",
      `/runtime/workers/${this.workerId}/commands/${commandId}/grant`,
      {},
    );
  }

  /** Says what became of an order. Only its holder may. */
  async reportCommand(
    commandId: string,
    outcome:
      | { outcome: "COMPLETED"; result: Record<string, unknown> }
      | { outcome: "FAILED"; failureReason: string },
  ): Promise<void> {
    if (!this.workerId) {
      throw new Error("cannot report a command before registering");
    }
    await this.call(
      "POST",
      `/runtime/workers/${this.workerId}/commands/${commandId}/report`,
      outcome,
    );
  }

  private async call<T>(
    method: string,
    path: string,
    body: unknown,
    options: { anonymous?: boolean } = {},
  ): Promise<T> {
    const response = await this.send(method, path, body, options);
    if (!response.ok) {
      throw new Error(
        `${method} ${path} failed: ${response.status} ${await response.text()}`,
      );
    }
    return (await response.json()) as T;
  }

  private async send(
    method: string,
    path: string,
    body: unknown,
    options: { anonymous?: boolean } = {},
  ): Promise<Response> {
    if (!options.anonymous && this.token === null) {
      throw new Error("this machine is not paired yet — no credential to send");
    }
    return fetch(`${this.config.hubUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        // Never attached to a pairing call: there is nothing to attach, and
        // sending an empty Bearer would be a lie about being authenticated.
        ...(options.anonymous ? {} : { authorization: `Bearer ${this.token}` }),
      },
      body: JSON.stringify(body),
      /**
       * §18 — a redirect is somebody else telling this worker where to send
       * its credential. That is the shape of CVE-2026-25253, where a URL the
       * client was told to trust exfiltrated the auth token. The hub is at
       * HUB_URL; anywhere else is a fault to report, never a place to follow.
       */
      redirect: "error",
    });
  }
}
