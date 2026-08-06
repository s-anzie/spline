"use client";

import { api } from "./api";
import { loadQueue } from "./queue";
import { useResource } from "./use-hub";

export interface Pulse {
  /** How many things are waiting on a person right now. */
  needsYou: number | null;
  unread: number | null;
  machinesReporting: number | null;
  machinesTotal: number | null;
  health: string | null;
  worstReason: string | null;
  assessedAt: string | null;
}

/**
 * The numbers the frame carries: what needs a person, what is unread, how
 * many machines are actually reporting, and the workspace's own health.
 *
 * It lives in the shell rather than in each screen so the counts stay visible
 * from wherever an operator happens to be — the point of a badge on a nav
 * item is that you see it while looking at something else.
 */
export function usePulse(
  workspaceId: string | null,
  organizationId: string | null,
): Pulse {
  const enabled = Boolean(workspaceId);

  const queue = useResource<number>(
    () =>
      loadQueue(organizationId, workspaceId!).then((entries) => ({
        ok: true as const,
        value: entries.length,
      })),
    [workspaceId, organizationId],
    { pollMs: 20_000, enabled },
  );

  const unread = useResource(() => api.notifications.unread(workspaceId!), [workspaceId], {
    pollMs: 30_000,
    enabled,
  });

  const workers = useResource(() => api.runtime.workers(workspaceId!), [workspaceId], {
    pollMs: 20_000,
    enabled,
  });

  const health = useResource(() => api.health(workspaceId!), [workspaceId], {
    pollMs: 20_000,
    enabled,
  });

  const level = health.data?.level ?? null;

  return {
    needsYou: queue.data,
    unread: unread.data?.length ?? null,
    machinesReporting: workers.data?.filter((worker) => !worker.stale).length ?? null,
    machinesTotal: workers.data?.length ?? null,
    health: level,
    // Named, because "DEGRADED" on its own is a word, not something to do.
    worstReason: health.data?.signals.find((signal) => signal.level === level)?.reason ?? null,
    assessedAt: health.data?.assessedAt ?? null,
  };
}
