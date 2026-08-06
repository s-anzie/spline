export interface EnrolmentRequest {
  deviceId: string;
  /**
   * §18 — the organization this machine was configured to join. Sent so the
   * hub can list this request to its owner and to nobody else; a machine that
   * names nobody appears in no list at all.
   */
  organizationId?: string;
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

/**
 * The one request this machine has open, remembered across restarts.
 *
 * Without it, every restart is a new pairing request: one machine becomes a
 * queue of hundreds of identical rows, the code on the console changes faster
 * than an operator can type it, and the only deliberately unauthenticated
 * route in the system gets hammered by its own daemon. That is not a
 * hypothetical — a crash loop here produced 1957 of them before the hub's
 * throttle stopped it.
 */
export interface TicketStore {
  load(): EnrolmentTicket | null;
  /** `null` clears it: the request has been decided, or it has expired. */
  save(ticket: EnrolmentTicket | null): void;
}

export interface PairingDeps {
  hub: PairingHub;
  machine: EnrolmentRequest;
  tickets: TicketStore;
  now: () => Date;
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
  // A request this machine already has, and that a human can still approve,
  // is resumed rather than replaced. The code stays the same across a restart
  // — which is what makes it typeable.
  const held = deps.tickets.load();
  let ticket: EnrolmentTicket;
  if (held && !hasExpired(held, deps.now())) {
    ticket = held;
  } else {
    try {
      ticket = await deps.hub.requestEnrolment(deps.machine);
    } catch (error) {
      return { isFailure: true, error: `could not ask the hub to pair: ${String(error)}` };
    }
    deps.tickets.save(ticket);
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
    ...(deps.machine.organizationId
      ? [
          "    Approve it from the console, as the owner of the organization",
          "    this machine asked to join. It is listed there, and nowhere else.",
        ]
      : [
          // §18 — a machine that named nobody is listed by nobody. Saying so
          // here is the difference between a setup step and a mystery.
          "    WARNING: no organization is configured on this machine, so it",
          "    appears in NOBODY's list of machines waiting to be paired.",
          "    Set WORKER_ORGANIZATION_ID and restart, or approve it by code",
          "    directly:",
        ]),
    "",
    `      POST /organizations/<id>/enrolments/decide  { "code": "${ticket.code}" }`,
    "",
    `    The code expires at ${ticket.expiresAt}.`,
    "",
  ]) {
    deps.announce(line);
  }

  /**
   * A refusal while waiting is not a failure to pair.
   *
   * The hub throttles its unauthenticated routes, and collecting a credential
   * is one of them — deliberately, because it is a route a stranger could
   * hammer. But a human takes a minute to reach the console and type eight
   * characters, so a worker polling through that minute WILL be refused. This
   * daemon used to treat that as fatal: it exited, systemd restarted it, and
   * it hit the same wall. Pairing could only ever succeed if somebody typed
   * the code within the first fifty seconds.
   *
   * So a transient failure backs off and keeps waiting. What it does NOT do
   * is wait forever: the attempt budget still runs down, so a hub that is
   * actually gone is still reported rather than polled in silence.
   */
  const BACKOFF_CEILING_MS = 60_000;
  let refusals = 0;
  let lastRefusal: string | null = null;

  for (let attempt = 0; attempt < deps.maxAttempts; attempt += 1) {
    let outcome: ClaimOutcome;
    try {
      outcome = await deps.hub.claimEnrolment(ticket.enrolmentId, deps.machine.deviceId);
      refusals = 0;
      lastRefusal = null;
    } catch (error) {
      refusals += 1;
      lastRefusal = String(error);
      // Doubling, capped: backing off at the same rate that earned the
      // refusal would simply earn it again.
      await deps.sleep(
        Math.min(deps.pollIntervalMs * 2 ** refusals, BACKOFF_CEILING_MS),
      );
      continue;
    }

    if (outcome.status === "approved") {
      deps.tickets.save(null);
      return {
        isFailure: false,
        value: { token: outcome.token, actorId: outcome.actorId },
      };
    }
    // Rejected is a decision, not a delay. Polling on would be nagging an
    // operator who already said no.
    if (outcome.status === "rejected") {
      deps.tickets.save(null);
      return {
        isFailure: true,
        error: "this pairing request was refused by the organization's owner",
      };
    }
    await deps.sleep(deps.pollIntervalMs);
  }

  // Polling stopped. The request is only forgotten if it can no longer be
  // approved — otherwise the next start picks up exactly where this left off.
  if (hasExpired(ticket, deps.now())) {
    deps.tickets.save(null);
  }
  // Which of the two ways it ran out matters to whoever reads the log: a code
  // nobody typed is a person's problem, a hub that never answered is not.
  if (lastRefusal) {
    return {
      isFailure: true,
      error: `could not collect the credential: ${lastRefusal}`,
    };
  }
  return {
    isFailure: true,
    error:
      "nobody approved this machine before the code expired — restart the " +
      "worker to get a new one",
  };
}

function hasExpired(ticket: EnrolmentTicket, now: Date): boolean {
  const expiry = new Date(ticket.expiresAt).getTime();
  // An unparseable stamp is treated as expired: asking again costs one
  // request, trusting it costs a machine that can never pair.
  return Number.isNaN(expiry) || expiry <= now.getTime();
}
