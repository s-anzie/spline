/**
 * §18 — rate limits.
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
