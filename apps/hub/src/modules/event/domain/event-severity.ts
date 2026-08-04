import { DomainEvent } from "../../../kernel/domain/domain-event";

export const EVENT_SEVERITIES = ["INFO", "WARNING", "ERROR", "CRITICAL"] as const;
export type EventSeverity = (typeof EVENT_SEVERITIES)[number];

/**
 * Severity is assigned by convention rather than declared on each of the
 * thirty-odd event classes: a fact does not know how alarming it is, and
 * making every author decide would give thirty inconsistent answers. This
 * table is what Notification and the alerts of §17.9 will read.
 */
const SEVERITY_BY_SUFFIX: ReadonlyArray<readonly [RegExp, EventSeverity]> = [
  [/_failed$|\.failed$/, "ERROR"],
  [/blocker_reported$|_revoked$|_crashed$/, "WARNING"],
  [/_cancelled$|_superseded$/, "WARNING"],
];

export function severityFor(eventName: string): EventSeverity {
  for (const [pattern, severity] of SEVERITY_BY_SUFFIX) {
    if (pattern.test(eventName)) {
      return severity;
    }
  }
  return "INFO";
}

/** Fields every event has; anything else is the fact's own payload. */
const STANDARD_FIELDS = new Set<string>([
  "eventName",
  "occurredAt",
  "aggregateId",
  "workspaceId",
]);

export function payloadOf(event: DomainEvent): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event)) {
    if (STANDARD_FIELDS.has(key) || typeof value === "function") {
      continue;
    }
    payload[key] = value;
  }
  return payload;
}
