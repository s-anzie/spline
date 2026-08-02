"use client";
import Link from "next/link";
import { useEffect } from "react";
import {
  ArrowRight,
  Bell,
  Boxes,
  CheckCircle2,
  Clock3,
  FileText,
  GitBranch,
  RefreshCw,
  Scale,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { PageHeader } from "@/components/shared/page-header";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";
import {
  ArtifactDialog,
  DecisionDialog,
  EventDialog,
  NotificationDialog,
} from "./record-dialogs";
import { EventReceiptsDialog } from "./event-receipts-dialog";
type Mode = "artifacts" | "decisions" | "events" | "notifications";
export function RecordsView({
  workspaceId,
  mode,
}: {
  workspaceId: string;
  mode: Mode;
}) {
  const {
    artifacts,
    decisions,
    events,
    notifications,
    loading,
    error,
    load,
    recordEventReceipt,
    advanceNotification,
    pendingAction,
  } = useWorkspaceDomainStore();
  useEffect(() => {
    void load(workspaceId);
  }, [load, workspaceId]);
  const configs = {
    artifacts: [
      "Entités versionnées",
      "Artefacts",
      "Fichiers, specs, diffs et documents liés au travail.",
    ],
    decisions: [
      "Mémoire du workspace",
      "Décisions",
      "Choix consignés avec contexte, options et niveau de confiance.",
    ],
    events: [
      "Journal immuable",
      "Historique",
      "Événements métier diffusés en temps réel et acquittables.",
    ],
    notifications: [
      "Communication",
      "Notifications",
      "Messages et alertes adressés dans le workspace.",
    ],
  } as const;
  const c = configs[mode];
  const action =
    mode === "artifacts" ? (
      <ArtifactDialog />
    ) : mode === "decisions" ? (
      <DecisionDialog />
    ) : mode === "notifications" ? (
      <NotificationDialog />
    ) : mode === "events" ? (
      <EventDialog />
    ) : null;
  return (
    <>
      <PageHeader
        eyebrow={c[0]}
        title={c[1]}
        description={c[2]}
        actions={
          <>
            <LoadingButton
              loading={loading}
              onClick={() => void load(workspaceId, true)}
              size="icon-lg"
              variant="outline"
            >
              <RefreshCw />
            </LoadingButton>
            {action}
          </>
        }
      />
      {error && <p className="mb-4 text-[10px] text-red-300">{error}</p>}
      {mode === "artifacts" && (
        <><div className="mb-5 grid gap-3 sm:grid-cols-3"><Card className="bg-white/[.015]"><CardContent className="flex items-center gap-3 p-4"><Boxes className="size-4 text-[#f47b64]"/><div><strong className="text-lg">{artifacts.length}</strong><p className="text-[8px] text-muted-foreground">ressources indexées</p></div></CardContent></Card><Card className="bg-white/[.015]"><CardContent className="flex items-center gap-3 p-4"><GitBranch className="size-4 text-sky-300"/><div><strong className="text-lg">{artifacts.reduce((sum, item) => sum + Math.max(0, item.version - 1), 0)}</strong><p className="text-[8px] text-muted-foreground">versions antérieures</p></div></CardContent></Card><Card className="bg-white/[.015]"><CardContent className="flex items-center gap-3 p-4"><CheckCircle2 className="size-4 text-emerald-400"/><div><strong className="text-lg">{artifacts.filter((item) => item.status === "ACTIVE").length}</strong><p className="text-[8px] text-muted-foreground">ressources actives</p></div></CardContent></Card></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {artifacts.map((a) => (
            <Link
              key={a.id}
              href={`/workspaces/${workspaceId}/artifacts/${a.id}`}
            >
              <Card className="h-full bg-white/[.018]">
                <CardContent className="p-5">
                  <FileText className="text-[#f47b64]" />
                  <h2 className="mt-7 text-xs">{a.name}</h2>
                  <div className="mt-3 flex gap-2">
                    <Badge variant="outline">{a.type}</Badge>
                    <Badge variant="outline">v{a.version}</Badge>
                    <Badge variant="outline">{a.status}</Badge>
                  </div>
                  <p className="mt-4 line-clamp-3 min-h-12 text-[9px] leading-4 text-muted-foreground">
                    {a.description || "Aucune description"}
                  </p>
                  <div className="mt-4 flex items-center justify-between border-t border-white/[.055] pt-3 text-[8px] text-muted-foreground"><span>{a.goalId ? "Liée à un objectif" : a.taskId ? "Liée à une tâche" : "Ressource autonome"}</span><span>{new Date(a.updatedAt).toLocaleDateString("fr-FR")}</span></div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div></>
      )}
      {mode === "decisions" && (
        <><div className="mb-5 grid gap-3 sm:grid-cols-3"><Card className="bg-white/[.015]"><CardContent className="p-4"><strong className="text-lg">{decisions.length}</strong><p className="text-[8px] text-muted-foreground">décisions consignées</p></CardContent></Card><Card className="bg-white/[.015]"><CardContent className="p-4"><strong className="text-lg">{decisions.filter((item) => (item.confidence ?? 0) >= .75).length}</strong><p className="text-[8px] text-muted-foreground">à forte confiance</p></CardContent></Card><Card className="bg-white/[.015]"><CardContent className="p-4"><strong className="text-lg">{decisions.reduce((sum, item) => sum + item.references.length, 0)}</strong><p className="text-[8px] text-muted-foreground">références traçables</p></CardContent></Card></div><div className="grid gap-3">
          {decisions.map((d) => (
            <Card key={d.id} className="bg-white/[.018]">
              <CardContent className="grid gap-4 p-5 md:grid-cols-[auto_minmax(0,1fr)_12rem]">
                <span className="grid size-10 place-items-center rounded-full border border-[#f47b64]/20 bg-[#f47b64]/10"><Scale className="size-5 text-[#f47b64]" /></span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm">{d.subject}</h2><Badge variant="outline">Décision actée</Badge></div>
                  {d.context && <p className="mt-2 text-[9px] leading-4 text-muted-foreground">Contexte · {d.context}</p>}
                  <p className="mt-3 border-l-2 border-[#f47b64]/40 pl-3 text-[10px] leading-5">
                    {d.decision}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">
                      Confiance{" "}
                      {d.confidence == null
                        ? "—"
                        : `${Math.round(d.confidence * 100)}%`}
                    </Badge>
                    <Badge variant="outline">
                      {new Date(d.decidedAt).toLocaleDateString("fr-FR")}
                    </Badge>
                    {d.optionsConsidered.length > 0 && <Badge variant="outline">{d.optionsConsidered.length} option(s) comparée(s)</Badge>}
                  </div>
                </div>
                <div className="border-t border-white/[.055] pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0"><p className="text-[8px] uppercase tracking-wider text-muted-foreground">Décidée par</p><p className="mt-1 truncate text-[9px]">{d.decidedByType} · {d.decidedById}</p><p className="mt-4 text-[8px] uppercase tracking-wider text-muted-foreground">Références</p><p className="mt-1 text-[9px]">{d.references.length || "Aucune"}</p></div>
              </CardContent>
            </Card>
          ))}
        </div></>
      )}
      {mode === "events" && (
        <div className="grid gap-2">
          {events.map((e) => (
            <Card key={e.id} className="bg-white/[.018]">
              <CardContent className="flex items-center gap-4 p-4">
                <Clock3 className="size-4 text-[#f47b64]" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-xs">{e.type}</h2>
                  <p className="truncate text-[8px] text-muted-foreground">
                    {JSON.stringify(e.payload)}
                  </p>
                </div>
                <Badge variant="outline">{e.severity}</Badge>
                <span className="text-[8px] text-muted-foreground">
                  {new Date(e.createdAt).toLocaleString("fr-FR")}
                </span>
                <LoadingButton
                  loading={pendingAction === `event:${e.id}:receipt`}
                  onClick={() => void recordEventReceipt(e.id, "ACKNOWLEDGED")}
                  size="xs"
                  variant="ghost"
                >
                  Acquitter
                </LoadingButton>
                <EventReceiptsDialog workspaceId={workspaceId} eventId={e.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {mode === "notifications" && (
        <div className="grid gap-2">
          {notifications.map((n) => (
            <Card key={n.id} className="bg-white/[.018]">
              <CardContent className="flex items-center gap-4 p-4">
                <Bell className="size-4 text-[#f47b64]" />
                <div className="flex-1">
                  <h2 className="text-xs">{n.title || n.kind}</h2>
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    {n.body}
                  </p>
                </div>
                <Badge variant="outline">{n.scope}</Badge>
                <LoadingButton
                  loading={pendingAction === `notification:${n.id}:advance`}
                  onClick={() => void advanceNotification(n.id, "SEEN")}
                  size="xs"
                  variant="ghost"
                >
                  Marquer vue
                  <ArrowRight />
                </LoadingButton>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {!loading &&
        ((mode === "artifacts" && !artifacts.length) ||
          (mode === "decisions" && !decisions.length) ||
          (mode === "events" && !events.length) ||
          (mode === "notifications" && !notifications.length)) && (
          <Card className="border-dashed">
            <CardContent className="grid min-h-48 place-items-center text-[10px] text-muted-foreground">
              Aucune donnée enregistrée.
            </CardContent>
          </Card>
        )}
    </>
  );
}
