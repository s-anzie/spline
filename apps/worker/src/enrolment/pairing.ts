export interface EnrolmentRequest {
  deviceId: string;
  hostname: string;
  architecture: string;
  operatingSystem: string;
  capabilities: string[];
  labels: string[];
}

export interface EnrolmentTicket {
  enrolmentId: string;
  code: string;
  expiresAt: string;
}

export type ClaimOutcome =
  | { status: "approved"; token: string; actorId: string }
  | { status: "pending" }
  | { status: "rejected" };

export interface PairingHub {
  requestEnrolment(request: EnrolmentRequest): Promise<EnrolmentTicket>;
  claimEnrolment(enrolmentId: string, deviceId: string): Promise<ClaimOutcome>;
}

export interface PairingDeps {
  hub: PairingHub;
  machine: EnrolmentRequest;
  /** Where the code is shown. Injected so a test can read what a human would. */
  announce: (line: string) => void;
  sleep: (ms: number) => Promise<void>;
  pollIntervalMs: number;
  maxAttempts: number;
}

export type PairingResult =
  | { isFailure: false; value: { token: string; actorId: string }; error?: undefined }
  | { isFailure: true; error: string; value?: undefined };

/**
 * §6.3, §18.2 — what a machine does when it holds no credential.
 *
 * It asks to be paired, prints the code it was given, and waits for a human
 * to approve that code from the hub. The code is the point: an operator reads
 * it off THIS machine's console, which no amount of network access gives
 * them. The alternative — an operator minting a token in the hub and pasting
 * it here — moves a long-lived secret through a clipboard and a shell
 * history, once per machine.
 *
 * Always returns; never throws. A daemon that cannot pair must say so and
 * stop, not die halfway through with a half-written state file.
 */
export async function pairMachine(deps: PairingDeps): Promise<PairingResult> {
  let ticket: EnrolmentTicket;
  try {
    ticket = await deps.hub.requestEnrolment(deps.machine);
  } catch (error) {
    return { isFailure: true, error: `could not ask the hub to pair: ${String(error)}` };
  }

  for (const line of [
    "",
    "  ┌──────────────────────────────────────────────┐",
    "  │  This machine is not paired yet.             │",
    "  └──────────────────────────────────────────────┘",
    "",
    `    machine:  ${deps.machine.hostname}`,
    `    can run:  ${deps.machine.capabilities.join(", ") || "(nothing declared)"}`,
    "",
    `    PAIRING CODE:  ${ticket.code}`,
    "",
    "    Approve it from the hub, as the owner of the organization",
    "    this machine should join:",
    "",
    `      POST /organizations/<id>/enrolments/decide  { "code": "${ticket.code}" }`,
    "",
    `    The code expires at ${ticket.expiresAt}.`,
    "",
  ]) {
    deps.announce(line);
  }

  for (let attempt = 0; attempt < deps.maxAttempts; attempt += 1) {
    let outcome: ClaimOutcome;
    try {
      outcome = await deps.hub.claimEnrolment(ticket.enrolmentId, deps.machine.deviceId);
    } catch (error) {
      return { isFailure: true, error: `could not collect the credential: ${String(error)}` };
    }

    if (outcome.status === "approved") {
      return {
        isFailure: false,
        value: { token: outcome.token, actorId: outcome.actorId },
      };
    }
    // Rejected is a decision, not a delay. Polling on would be nagging an
    // operator who already said no.
    if (outcome.status === "rejected") {
      return {
        isFailure: true,
        error: "this pairing request was refused by the organization's owner",
      };
    }
    await deps.sleep(deps.pollIntervalMs);
  }

  return {
    isFailure: true,
    error:
      "nobody approved this machine before the code expired — restart the " +
      "worker to get a new one",
  };
}
