/**
 * Shared staleness thresholds for the runtime module. Centralized so the
 * dispatch guard (StartAgentSessionUseCase) and the health summary
 * (GetRuntimeHealthUseCase) never silently drift apart on what "stale" means.
 */

/** 3x the daemon's machine_heartbeat interval (apps/runtime/src/main.ts, HEARTBEAT_INTERVAL_MS = 15000). */
export const MACHINE_STALE_TTL_MS = 45_000;

/** Sessions heartbeat on the same interval as the machine heartbeat — see apps/runtime/src/main.ts. */
export const SESSION_STALE_TTL_MS = 45_000;

/** A command still PENDING/SENT this long after creation almost certainly landed on a dead connection. */
export const STUCK_COMMAND_TTL_MS = 60_000;
