"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Bell, Bot, CheckCheck, Circle, MessageSquareText, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";
import { NotificationDialog } from "./record-dialogs";

type Filter = "ALL" | "ACTION" | "SYSTEM";

export function ActivityCenter({ workspaceId }: { workspaceId: string }) {
  const { notifications, questions, sessions, loading, error, pendingAction, load, advanceNotification } = useWorkspaceDomainStore();
  const [filter, setFilter] = useState<Filter>("ALL");
  useEffect(() => { void load(workspaceId); }, [load, workspaceId]);
  const active = sessions.filter((session) => ["STARTING", "RUNNING"].includes(session.status));
  const items = useMemo(() => notifications.filter((notification) => filter === "ALL" || (filter === "ACTION" ? Boolean(notification.taskId) || notification.scope === "USER" : !notification.taskId)), [filter, notifications]);
  return <>
    <PageHeader eyebrow="Flux de collaboration" title="Activité" description="Voir ce qui bouge maintenant, ce qui demande une réponse et les messages émis par le collectif." actions={<><LoadingButton loading={loading} onClick={() => void load(workspaceId, true)} size="icon-lg" variant="outline"><RefreshCw/></LoadingButton><NotificationDialog/></>}/>
    <div className="mb-5 grid gap-3 md:grid-cols-3">
      <Card className="bg-[#f47b64]/[.045]"><CardContent className="flex items-center gap-3 p-4"><span className="relative grid size-9 place-items-center rounded-full bg-[#f47b64]/10"><Bot className="size-4 text-[#f47b64]"/>{active.length > 0 && <span className="absolute right-0 top-0 size-2 animate-pulse rounded-full bg-emerald-400"/>}</span><div><strong className="text-lg">{active.length}</strong><p className="text-[9px] text-muted-foreground">agents au travail</p></div></CardContent></Card>
      <Card className="bg-white/[.015]"><CardContent className="flex items-center gap-3 p-4"><MessageSquareText className="size-4 text-amber-300"/><div><strong className="text-lg">{questions.filter((q) => q.status === "OPEN").length}</strong><p className="text-[9px] text-muted-foreground">questions ouvertes</p></div></CardContent></Card>
      <Card className="bg-white/[.015]"><CardContent className="flex items-center gap-3 p-4"><Bell className="size-4 text-sky-300"/><div><strong className="text-lg">{notifications.length}</strong><p className="text-[9px] text-muted-foreground">messages récents</p></div></CardContent></Card>
    </div>
    <div className="mb-4 flex gap-1 rounded-xl border border-white/[.055] bg-white/[.018] p-1.5">{(["ALL","ACTION","SYSTEM"] as Filter[]).map((value) => <Button key={value} onClick={() => setFilter(value)} size="sm" variant={filter === value ? "secondary" : "ghost"}>{value === "ALL" ? "Tout" : value === "ACTION" ? "À traiter" : "Information"}</Button>)}</div>
    {error && <p className="mb-4 text-[10px] text-red-300">{error}</p>}
    <div className="grid gap-2">{items.map((notification) => <Card key={notification.id} className="border-white/[.07] bg-white/[.018] transition-colors hover:bg-white/[.028]"><CardContent className="grid gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"><span className="grid size-9 place-items-center rounded-full border border-white/[.07] bg-white/[.025]"><Circle className="size-3 fill-[#f47b64] text-[#f47b64]"/></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xs">{notification.title || notification.kind}</h2><Badge variant="outline">{notification.scope}</Badge>{notification.taskId && <Badge variant="outline">Action requise</Badge>}</div><p className="mt-1 text-[10px] leading-5 text-muted-foreground">{notification.body}</p><p className="mt-2 text-[8px] text-muted-foreground">{notification.createdBy.type} · {new Date(notification.createdAt).toLocaleString("fr-FR")}</p></div><LoadingButton loading={pendingAction === `notification:${notification.id}:advance`} onClick={() => void advanceNotification(notification.id, "SEEN")} size="sm" variant="ghost"><CheckCheck/>Vu</LoadingButton></CardContent></Card>)}</div>
    {!loading && !items.length && <Card className="border-dashed"><CardContent className="grid min-h-52 place-items-center text-center"><div><AlertCircle className="mx-auto size-6 text-muted-foreground"/><h2 className="mt-3 text-sm">Aucune activité dans ce filtre</h2><p className="mt-1 text-[10px] text-muted-foreground">Les nouveaux messages et demandes apparaîtront ici.</p></div></CardContent></Card>}
  </>;
}
