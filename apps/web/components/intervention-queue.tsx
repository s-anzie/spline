"use client";

import { useCallback, useEffect, useState } from "react";

import { hub } from "@/lib/hub";
import { Intervention, InterventionKind, loadQueue } from "@/lib/queue";
import { useSession } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * A colour per kind, and colour means one thing: this needs you. Nothing here
 * is decorative — an operator scanning the list is deciding what to do next.
 */
const TONE: Record<InterventionKind, { label: string; colour: string }> = {
  enrolment: { label: "pairing", colour: "var(--color-signal)" },
  validation: { label: "validate", colour: "var(--color-warn)" },
  blocked: { label: "blocked", colour: "var(--color-danger)" },
  silent: { label: "quiet", colour: "var(--color-ink-400)" },
  stuck: { label: "stuck", colour: "var(--color-danger)" },
};

export function InterventionQueue() {
  const { workspaceId, organizations } = useSession();
  const organizationId = organizations[0]?.id ?? null;
  const [queue, setQueue] = useState<Intervention[] | null>(null);
  const [code, setCode] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setQueue(await loadQueue(organizationId, workspaceId));
  }, [organizationId, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function approve() {
    if (!organizationId) {
      return;
    }
    const decided = await hub.post<{ hostname: string }>(
      `/organizations/${organizationId}/enrolments/decide`,
      { code: code.trim().toUpperCase() },
    );
    setNote(
      decided.ok
        ? `${decided.value.hostname} is paired.`
        : decided.error.message,
    );
    setCode("");
    await refresh();
  }

  const pairing = queue?.some((entry) => entry.kind === "enrolment") ?? false;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">What needs you</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Everything below is something nothing else will do on its own. An
          empty list means the system is up to date — and it says so, rather
          than looking abandoned.
        </p>
      </header>

      {/*
        §6.3 — the code is read off the machine's own console, which is what
        makes approving it proof that you can see that machine. Shown only
        when something is actually waiting: a permanent form invites pasting
        codes nobody asked for.
      */}
      {pairing ? (
        <section
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <h2 className="mb-2 text-sm font-medium">Approve a machine</h2>
          <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
            Type the code printed on that machine&apos;s console. Reading it there
            is what proves you can see it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="K7QM4T2X"
              className="max-w-[12rem] font-mono tracking-widest uppercase"
              aria-label="Pairing code"
            />
            <Button onClick={() => void approve()} disabled={code.trim().length < 4}>
              Approve
            </Button>
          </div>
          {note ? (
            <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
              {note}
            </p>
          ) : null}
        </section>
      ) : null}

      {queue === null ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Reading the queue…
        </p>
      ) : queue.length === 0 ? (
        <p
          className="rounded-xl border p-6 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" }}
        >
          Nothing is waiting. Every machine is paired, every run has been
          judged, and nobody has gone quiet.
        </p>
      ) : (
        <ul className="space-y-2">
          {queue.map((entry, index) => (
            <li
              key={`${entry.kind}-${index}`}
              className="flex flex-wrap items-start gap-x-4 gap-y-1 rounded-xl border p-4"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              {/* A stripe rather than a dot: readable without colour vision. */}
              <span
                aria-hidden
                className="mt-1 h-4 w-1 shrink-0 rounded-full"
                style={{ background: TONE[entry.kind].colour }}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{entry.title}</p>
                {/* §17.8 — the reason travels with the name, or the name is
                    not something anybody can act on. */}
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  {entry.detail}
                </p>
              </div>
              <span
                className="rounded-full border px-2 py-0.5 text-xs"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                {TONE[entry.kind].label}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Button variant="outline" size="sm" onClick={() => void refresh()}>
        Refresh
      </Button>
    </div>
  );
}
