/**
 * §18 — the hardening knobs: rate limits and network exposure.
 *
 * Read from the environment rather than injected, because `@Throttle(...)` is
 * a decorator: it is evaluated when the controller class is defined, long
 * before any container exists. Every value has a production-safe default, so
 * an operator who sets nothing still gets the protection.
 */

function positiveInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** The window every limit below is expressed over. */
export function throttleTtlMs(): number {
  return positiveInteger(process.env.THROTTLE_TTL_MS, 60_000);
}

/**
 * The ceiling that applies to every route. Generous on purpose: it exists to
 * stop a runaway client or a crude flood, not to police normal use. A worker
 * polling its queue and a UI rendering a workspace both sit far below it.
 */
export function globalThrottleLimit(): number {
  return positiveInteger(process.env.THROTTLE_LIMIT, 600);
}

/**
 * The ceiling on routes where a caller is guessing a secret — logging in,
 * registering, redeeming an enrolment token. Bcrypt makes each attempt cheap
 * for the attacker and expensive for us, which is exactly backwards without
 * a limit.
 */
export function authThrottleLimit(): number {
  return positiveInteger(process.env.AUTH_THROTTLE_LIMIT, 10);
}

/**
 * The interface the hub listens on.
 *
 * `app.listen(port)` binds 0.0.0.0 — every interface, including whatever the
 * machine is connected to. OpenClaw shipped that default and 40,000 of its
 * instances ended up reachable from the internet, most of them exploitable;
 * their own hardening guide now names a loopback bind as the first control.
 *
 * Loopback here too, and reaching it from elsewhere is a decision an operator
 * makes on purpose. A reverse proxy or a tunnel keeps that decision in one
 * place instead of spreading it across every deployment.
 */
export function listenHost(): string {
  const configured = process.env.LISTEN_HOST?.trim();
  return configured && configured !== "" ? configured : "127.0.0.1";
}
