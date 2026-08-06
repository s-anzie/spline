"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw, ScrollText } from "lucide-react";

import { api } from "@/lib/api";
import { since, stamp } from "@/lib/format";
import { usePaged } from "@/lib/paging";
import { routes } from "@/lib/routes";
import { useSession } from "@/lib/store";
import { toneOf } from "@/lib/tone";
import { useResource } from "@/lib/use-hub";
import {
  Empty,
  Loading,
  Note,
  PageHeader,
  Pager,
  Panel,
  Payload,
  Segmented,
  Stripe,
} from "@/components/kit";
import { Button } from "@/components/ui/button";

/** What the hub is asked for. The journal always continues past it. */
const CAP = 150;

/**
 * The journal.
 *
 * Grouped by the family before the dot — `task.*`, `agent.*`, `runtime.*` —
 * because that is how somebody looks for a thing they half remember. The full
 * type is still printed on every row; the filter is a way in, not a summary.
 */
export function Activity() {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const [family, setFamily] = useState("");
  const events = useResource(() => api.events.list(workspaceId, CAP), [workspaceId], {
    pollMs: 8_000,
  });

  const families = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events.data ?? []) {
      const key = event.type.split(".")[0] ?? event.type;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [events.data]);

  const shown = (events.data ?? []).filter(
    (event) => !family || event.type.startsWith(`${family}.`),
  );
  const paged = usePaged(shown);

  return (
    <>
      <PageHeader
        title="Activity"
        lead="Everything that happened, in the order the hub sequenced it. This is the record agents and machines write to — nothing here was typed by a person."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={events.reload}
            disabled={events.refreshing}
          >
            <RefreshCw className={events.refreshing ? "animate-spin" : undefined} />
            Refresh
          </Button>
        }
      />

      {families.length > 0 ? (
        <div className="mb-4">
          <Segmented
            value={family}
            onChange={setFamily}
            options={[
              { value: "", label: "Everything", count: events.data?.length },
              ...families.map(([key, count]) => ({ value: key, label: key, count })),
            ]}
          />
        </div>
      ) : null}

      {events.loading ? <Loading rows={6} /> : null}
      {events.error ? <Note>{events.error}</Note> : null}
      {events.data && shown.length === 0 ? (
        <Empty icon={ScrollText} title="Nothing recorded yet">
          The journal fills itself as agents and machines report.
        </Empty>
      ) : null}

      {shown.length > 0 ? (
        <>
        <Panel>
          {paged.items.map((event) => (
            <div
              key={event.id}
              className="hover:bg-accent/40 flex items-stretch gap-3 px-4 py-2.5 transition-colors"
            >
              <Stripe tone={toneOf(event.severity)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2.5">
                  <span className="measure shrink-0 text-sm font-medium">{event.type}</span>
                  <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                    {event.actor
                      ? `${event.actor.type.toLowerCase()} ${event.actor.id.slice(0, 8)} → `
                      : ""}
                    {event.target.type.toLowerCase()}{" "}
                    <span className="measure">{event.target.id.slice(0, 8)}</span>
                  </span>
                  <span
                    className="measure text-muted-foreground shrink-0 text-xs"
                    title={stamp(event.createdAt)}
                  >
                    {since(event.createdAt)}
                  </span>
                  <span
                    className="measure text-muted-foreground/60 w-12 shrink-0 text-right text-[0.625rem]"
                    title="hub sequence — a total order, no ties"
                  >
                    {event.sequence}
                  </span>
                </div>

                {/* Targets that have a screen of their own are reachable from
                    the row — the journal is where an investigation starts. */}
                {event.target.type === "TASK" || event.target.type === "RUN" ? (
                  <Link
                    href={
                      event.target.type === "TASK"
                        ? routes.task(event.target.id)
                        : routes.run(event.target.id)
                    }
                    className="text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-1 text-xs transition-colors"
                  >
                    open the {event.target.type.toLowerCase()}
                    <ArrowRight className="size-3" />
                  </Link>
                ) : null}

                <Payload value={event.payload} />
              </div>
            </div>
          ))}
        </Panel>
        <Pager paged={paged} cap={CAP} />
        </>
      ) : null}
    </>
  );
}
