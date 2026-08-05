import { arch, platform } from "node:os";

import { WorkerConfig } from "../config/config";
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
}

/**
 * The worker's only way to talk to the hub, and deliberately thin: §6.9 makes
 * the Control Plane authoritative, so this never decides anything — it says
 * what happened and does what it is told.
 */
export class HubClient {
  private workerId: string | null = null;

  constructor(private readonly config: WorkerConfig) {}

  get id(): string | null {
    return this.workerId;
  }

  /** §6.3 — the machine announces what it is; the hub answers with its id. */
  async register(capabilities: Capabilities): Promise<string> {
    const body = await this.call<{ workerId: string }>("POST", "/runtime/workers", {
      hostname: this.config.hostname,
      architecture: arch(),
      operatingSystem: platform(),
      capabilities: capabilities.capabilities,
      labels: capabilities.labels,
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

  private async call<T>(method: string, path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.config.hubUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.token}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(
        `${method} ${path} failed: ${response.status} ${await response.text()}`,
      );
    }
    return (await response.json()) as T;
  }
}
