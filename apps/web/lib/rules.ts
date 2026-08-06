/**
 * The rules that are actually enforced, and what enforces them.
 *
 * The Policy Engine stores any rule anyone writes: the name is a free string
 * and the value is arbitrary JSON, by design (§12.3 lists examples, not a
 * closed set). That is a good design and a bad interface — a screen listing
 * stored policies makes every one of them look like it does something, when
 * only the rules below have a consumer today.
 *
 * So this list is written down, cross-checked against the adapters that read
 * them, and the screen marks anything else as recorded rather than applied.
 * §17.8's rule about never showing a bare count is the same rule: a number,
 * or a policy, that does not say what it means is not information.
 */
export interface EnforcedRule {
  rule: string;
  type: string;
  /** What changes when this is set. Written for whoever is about to set it. */
  does: string;
  /** What the hub does when nobody sets it. */
  fallback: string;
  kind: "number" | "strings";
  unit?: string;
  example: string;
}

export const ENFORCED_RULES: EnforcedRule[] = [
  {
    rule: "required_validations",
    type: "VALIDATION",
    does: "Proof a task must carry before anybody can approve it as done.",
    fallback: "nothing is mandated; a task can be approved on judgement alone",
    kind: "strings",
    example: "TEST, REVIEW",
  },
  {
    rule: "max_lock_ttl_ms",
    type: "RUNTIME",
    does: "Ceiling on how long any lock may be held. A longer lease is refused.",
    fallback: "no ceiling — a lock lasts as long as it asked for",
    kind: "number",
    unit: "ms",
    example: "900000",
  },
  {
    rule: "staleness_locks_ms",
    type: "RUNTIME",
    does: "How long a lock may sit before health calls it degraded.",
    fallback: "the hub's built-in window",
    kind: "number",
    unit: "ms",
    example: "1800000",
  },
  {
    rule: "staleness_blocked_tasks_ms",
    type: "RUNTIME",
    does: "How long a task may stay blocked before health complains.",
    fallback: "the hub's built-in window",
    kind: "number",
    unit: "ms",
    example: "3600000",
  },
  {
    rule: "staleness_pending_validations_ms",
    type: "VALIDATION",
    does: "How long a submission may wait for a verdict before it is degraded.",
    fallback: "the hub's built-in window",
    kind: "number",
    unit: "ms",
    example: "3600000",
  },
  {
    rule: "staleness_workers_ms",
    type: "RUNTIME",
    does: "How long a machine may go without a heartbeat before it counts as silent.",
    fallback: "the hub's built-in window",
    kind: "number",
    unit: "ms",
    example: "120000",
  },
  {
    rule: "staleness_sessions_ms",
    type: "RUNTIME",
    does: "How long an agent session may go quiet before health flags it.",
    fallback: "the hub's built-in window",
    kind: "number",
    unit: "ms",
    example: "600000",
  },
  {
    rule: "staleness_commands_ms",
    type: "RUNTIME",
    does: "How long an order may sit claimed and unreported before it is degraded.",
    fallback: "the hub's built-in window",
    kind: "number",
    unit: "ms",
    example: "600000",
  },
];

export const ENFORCED = new Set(ENFORCED_RULES.map((entry) => entry.rule));

/** Milliseconds as somebody would say them out loud. */
export function humanMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}
