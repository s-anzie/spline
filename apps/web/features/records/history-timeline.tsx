"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock3,
  RefreshCw,
  UserRound,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import type { WorkspaceEvent } from "@/lib/api/types";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";
import { EventReceiptsDialog } from "./event-receipts-dialog";

type Filter = "ALL" | "IMPORTANT" | "ERRORS";

function eventSummary(event: WorkspaceEvent): string {
  for (const key of ["summary", "message", "action", "status"]) {
    const value = event.payload[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "Événement enregistré sans résumé textuel.";
}

function dayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Aujourd’hui";
  if (date.toDateString() === yesterday.toDateString()) return "Hier";
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function severityStyle(severity: string) {
  if (severity === "CRITICAL" || severity === "ERROR")
    return "border-red-400/25 bg-red-400/10 text-red-300";
  if (severity === "WARNING")
    return "border-amber-400/25 bg-amber-400/10 text-amber-300";
  return "border-[#f47b64]/20 bg-[#f47b64]/10 text-[#f47b64]";
}

function TimelineEvent({
  event,
  workspaceId,
}: {
  event: WorkspaceEvent;
  workspaceId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const actorIsAgent = event.actor.type === "AGENT";

  return (
    <div className="relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
      <div className="absolute bottom-0 left-[1.1rem] top-9 w-px bg-white/[.07] last:hidden" />
      <span
        className={`z-10 grid size-9 place-items-center rounded-full border ${severityStyle(event.severity)}`}
      >
        {event.severity === "ERROR" || event.severity === "CRITICAL" ? (
          <AlertTriangle className="size-4" />
        ) : actorIsAgent ? (
          <Bot className="size-4" />
        ) : (
          <UserRound className="size-4" />
        )}
      </span>
      <Card className="border-white/[.07] bg-white/[.018] transition-colors hover:bg-white/[.026]">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs font-medium">{event.type}</h3>
                <Badge variant="outline">{event.severity}</Badge>
                <Badge variant="outline">
                  {actorIsAgent ? "Agent" : "Humain"}
                </Badge>
              </div>
              <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
                {eventSummary(event)}
              </p>
            </div>
            <time className="flex shrink-0 items-center gap-1.5 text-[8px] text-muted-foreground">
              <Clock3 className="size-3" />
              {new Date(event.createdAt).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </time>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[.05] pt-3">
            <span className="truncate font-mono text-[8px] text-muted-foreground">
              {event.actor.id}
              {event.target ? ` → ${event.target.type}:${event.target.id}` : ""}
            </span>
            <div className="flex gap-1">
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setExpanded((value) => !value)}
              >
                Données
                <ChevronDown
                  className={`transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </Button>
              <EventReceiptsDialog workspaceId={workspaceId} eventId={event.id} />
            </div>
          </div>
          {expanded && (
            <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-white/[.055] bg-black/25 p-3 text-[8px] leading-4 text-muted-foreground">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function HistoryTimeline({ workspaceId }: { workspaceId: string }) {
  const { events, loading, error, load } = useWorkspaceDomainStore();
  const [filter, setFilter] = useState<Filter>("ALL");

  useEffect(() => {
    void load(workspaceId);
  }, [load, workspaceId]);

  const visible = useMemo(
    () =>
      events.filter((event) =>
        filter === "ALL"
          ? true
          : filter === "ERRORS"
            ? ["ERROR", "CRITICAL"].includes(event.severity)
            : event.severity !== "DEBUG",
      ),
    [events, filter],
  );
  const groups = useMemo(() => {
    const result = new Map<string, WorkspaceEvent[]>();
    for (const event of visible) {
      const key = new Date(event.createdAt).toDateString();
      result.set(key, [...(result.get(key) ?? []), event]);
    }
    return [...result.values()];
  }, [visible]);

  return (
    <>
      <PageHeader
        eyebrow="Mémoire chronologique"
        title="Historique"
        description="Comprendre ce qui s’est passé, dans quel ordre, par quel acteur et avec quelles conséquences."
        actions={
          <LoadingButton
            loading={loading}
            onClick={() => void load(workspaceId, true)}
            size="icon-lg"
            variant="outline"
          >
            <RefreshCw />
          </LoadingButton>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Événements", value: events.length, icon: Activity },
          { label: "Importants", value: events.filter((event) => event.severity !== "DEBUG").length, icon: CheckCircle2 },
          { label: "Erreurs", value: events.filter((event) => ["ERROR", "CRITICAL"].includes(event.severity)).length, icon: AlertTriangle },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="border-white/[.07] bg-white/[.015]">
            <CardContent className="flex items-center gap-3 p-4">
              <Icon className="size-4 text-[#f47b64]" />
              <div><strong className="text-lg">{value}</strong><p className="text-[8px] text-muted-foreground">{label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-5 flex gap-1 rounded-xl border border-white/[.055] bg-white/[.018] p-1.5">
        {(["ALL", "IMPORTANT", "ERRORS"] as Filter[]).map((value) => (
          <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} onClick={() => setFilter(value)}>
            {value === "ALL" ? "Tout" : value === "IMPORTANT" ? "Important" : "Erreurs"}
          </Button>
        ))}
      </div>

      {error && <p className="mb-4 text-[10px] text-red-300">{error}</p>}
      <div className="grid gap-7">
        {groups.map((group) => (
          <section key={new Date(group[0]!.createdAt).toDateString()}>
            <h2 className="mb-3 text-[9px] font-medium uppercase tracking-[.14em] text-muted-foreground">
              {dayLabel(group[0]!.createdAt)} · {group.length} événement(s)
            </h2>
            {group.map((event) => <TimelineEvent key={event.id} event={event} workspaceId={workspaceId} />)}
          </section>
        ))}
      </div>
      {!loading && !visible.length && (
        <Card className="border-dashed border-white/[.07] bg-white/[.012]">
          <CardContent className="grid min-h-56 place-items-center text-center">
            <div><Clock3 className="mx-auto size-7 text-muted-foreground"/><h2 className="mt-3 text-sm">Aucun événement dans cette période</h2><p className="mt-1 text-[10px] text-muted-foreground">La chronologie se construira au fil des actions du workspace.</p></div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
