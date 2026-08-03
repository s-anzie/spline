"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Activity, AlertTriangle, ArrowRight, Bot, CheckCircle2, Circle, MessageSquareText, RefreshCw, Target, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { Progress } from "@/components/ui/progress";
import { usePlanningStore } from "@/stores/planning-store";
import { useRealtimeStore } from "@/stores/realtime-store";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

export function WorkspaceOverview({ workspaceId }: { workspaceId: string }) {
  const workspace = useWorkspaceStore((state) => state.workspaces.find((item) => item.id === workspaceId));
  const loadWorkspaces = useWorkspaceStore((state) => state.loadWorkspaces);
  const { goals, tasks, loading: planLoading, load: loadPlan } = usePlanningStore();
  const { agents, sessions, questions, notifications, artifacts, loading: domainLoading, load: loadDomains } = useWorkspaceDomainStore();
  const connected = useRealtimeStore((state) => state.connected);
  useEffect(() => { void loadWorkspaces(); void loadPlan(workspaceId); void loadDomains(workspaceId); }, [loadDomains, loadPlan, loadWorkspaces, workspaceId]);

  const primary = goals.find((goal) => goal.status === "ACTIVE") ?? goals[0];
  const manager = agents.find((agent) => agent.displayName.toLowerCase().includes("manager") || String(agent.promptProfile.role ?? "").toLowerCase() === "manager");
  const managerSession = sessions.find((session) => session.agentId === manager?.id && !session.endedAt);
  const blocked = tasks.filter((task) => task.status === "BLOCKED");
  const pending = [...goals, ...tasks].filter((item) => item.validationState === "PENDING");
  const orphanTasks = tasks.filter((task) => !task.goalId);
  const openQuestions = questions.filter((question) => question.status === "OPEN");
  const humanQuestions = notifications.filter((notification) => notification.payload["collaborationType"] === "MANAGER_HUMAN_QUESTION" && typeof notification.payload["humanAnswer"] !== "string");
  const refresh = () => { void loadPlan(workspaceId, true); void loadDomains(workspaceId, true); };

  const next = openQuestions.length || humanQuestions.length
    ? { title: "Une question attend une réponse", detail: "Le collectif a besoin d’une décision pour continuer.", href: `/workspaces/${workspaceId}/attention`, action: "Répondre" }
    : blocked.length
      ? { title: `${blocked.length} tâche(s) bloquée(s)`, detail: "Le travail ne peut pas avancer sans arbitrage ou réaffectation.", href: `/workspaces/${workspaceId}/tasks`, action: "Résoudre" }
      : pending.length
        ? { title: `${pending.length} résultat(s) à valider`, detail: "Vérifiez les preuves avant d’accepter le travail livré.", href: `/workspaces/${workspaceId}/review`, action: "Examiner" }
        : managerSession
          ? { title: "Le manager est prêt", detail: "Ouvrez la conversation pour suivre le travail ou préciser votre intention.", href: `/workspaces/${workspaceId}/execution?session=${managerSession.id}`, action: "Parler au manager" }
          : { title: "Démarrer avec le manager", detail: "Expliquez le résultat que vous souhaitez ; le manager organisera ensuite l’équipe.", href: `/workspaces/${workspaceId}/execution`, action: "Ouvrir les conversations" };

  return <>
    <PageHeader eyebrow={`${workspace?.name ?? "Workspace"} · ${connected ? "connecté" : "hors ligne"}`} title="Bonjour, que faut-il faire maintenant ?" description="Cet écran résume la situation et vous conduit vers la prochaine décision utile. Vous n’avez pas besoin de piloter les détails techniques pour faire avancer le workspace." actions={<LoadingButton loading={planLoading || domainLoading} onClick={refresh} variant="outline"><RefreshCw/>Actualiser</LoadingButton>}/>

    <Card className="mb-4 overflow-hidden border-[#f47b64]/20 bg-[linear-gradient(125deg,rgba(244,123,100,.10),rgba(255,255,255,.015)_58%)]">
      <CardContent className="grid gap-5 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-[#f47b64]">Prochaine action recommandée</p><h2 className="mt-2 text-xl">{next.title}</h2><p className="mt-2 max-w-2xl text-[10px] leading-5 text-muted-foreground">{next.detail}</p></div>
        <Button nativeButton={false} render={<Link href={next.href}/>} size="lg" className="bg-[#f47b64] text-[#241614]">{next.action}<ArrowRight/></Button>
      </CardContent>
    </Card>

    <div className="mb-4 grid gap-2 rounded-xl border border-white/[.065] bg-white/[.012] p-3 sm:grid-cols-4">
      {[{ step:"1", title:"Vous donnez le cap", text:"Parlez uniquement au manager." },{ step:"2", title:"Il organise", text:"Objectifs, tâches et délégation." },{ step:"3", title:"L’équipe produit", text:"Suivez sans micro-piloter." },{ step:"4", title:"Vous décidez", text:"Validez les résultats importants." }].map((item, index) => <div key={item.step} className="relative flex gap-3 rounded-lg p-2.5"><span className="grid size-7 shrink-0 place-items-center rounded-full border border-[#f47b64]/25 bg-[#f47b64]/10 text-[9px] font-semibold text-[#f47b64]">{item.step}</span><div><p className="text-[10px] font-medium">{item.title}</p><p className="mt-1 text-[8px] leading-4 text-muted-foreground">{item.text}</p></div>{index < 3 && <ArrowRight className="absolute -right-2 top-4 z-10 hidden size-3 text-white/15 sm:block"/>}</div>)}
    </div>

    {orphanTasks.length > 0 && <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[.055] p-4 sm:flex-row sm:items-center"><AlertTriangle className="size-5 shrink-0 text-amber-300"/><div className="flex-1"><h2 className="text-xs">Planification incohérente détectée</h2><p className="mt-1 text-[9px] text-amber-100/60">{orphanTasks.length} tâche(s) ne sont rattachées à aucun objectif. La progression de « {primary?.title ?? "l’objectif"} » ne peut donc pas les prendre en compte.</p></div><Button nativeButton={false} render={<Link href={`/workspaces/${workspaceId}/tasks`}/>} size="sm" variant="outline">Voir les tâches</Button></div>}

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
      <Card className="border-white/[.075] bg-white/[.018]"><CardContent className="p-5">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[8px] uppercase tracking-wider text-muted-foreground">Résultat poursuivi</p><h2 className="mt-2 text-sm">{primary?.title ?? "Aucun objectif défini"}</h2></div><Button nativeButton={false} render={<Link href={`/workspaces/${workspaceId}/plan`}/>} size="sm" variant="ghost">Voir le travail<ArrowRight/></Button></div>
        {primary ? <><div className="mt-5 flex items-end justify-between"><strong className="text-3xl">{primary.progressPercentage}%</strong><span className="text-[9px] text-muted-foreground">{tasks.filter((task) => task.goalId === primary.id && task.status === "DONE").length}/{tasks.filter((task) => task.goalId === primary.id).length} tâches liées terminées</span></div><Progress value={primary.progressPercentage} className="mt-3"/><div className="mt-5 grid gap-2 sm:grid-cols-2">{tasks.filter((task) => task.goalId === primary.id).slice(0,4).map((task) => <div key={task.id} className="flex items-center gap-2 rounded-lg border border-white/[.055] p-3">{task.status === "DONE" ? <CheckCircle2 className="size-3.5 text-emerald-400"/> : <Circle className="size-3.5 text-muted-foreground"/>}<span className="min-w-0 flex-1 truncate text-[9px]">{task.title}</span><Badge variant="outline">{task.status}</Badge></div>)}</div></> : <div className="mt-6 rounded-xl border border-dashed border-white/[.07] p-6 text-center"><Target className="mx-auto size-6 text-muted-foreground"/><p className="mt-2 text-[10px]">Expliquez votre intention au manager ou créez un objectif.</p></div>}
      </CardContent></Card>

      <Card className="border-white/[.075] bg-white/[.018]"><CardContent className="p-5"><div className="flex items-center gap-2"><MessageSquareText className="size-4 text-[#f47b64]"/><h2 className="text-sm">Conversation principale</h2></div>{manager ? <div className="mt-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-[#f47b64]/10"><Bot className="size-4 text-[#f47b64]"/></span><div><p className="text-xs">{manager.displayName}</p><p className="text-[8px] text-muted-foreground">Votre interlocuteur unique · {managerSession?.status ?? "sans session"}</p></div></div><p className="mt-4 text-[9px] leading-5 text-muted-foreground">Décrivez-lui le résultat attendu. Il planifie, délègue aux contributeurs et revient vers vous lorsqu’une décision humaine est nécessaire.</p><Button nativeButton={false} render={<Link href={managerSession ? `/workspaces/${workspaceId}/execution?session=${managerSession.id}` : `/workspaces/${workspaceId}/execution`}/>} className="mt-4 w-full" variant="outline">Ouvrir la conversation<ArrowRight/></Button></div> : <p className="mt-5 text-[10px] text-muted-foreground">Aucun manager n’est configuré dans cette équipe.</p>}</CardContent></Card>
    </div>

    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[.055] pt-4">
      <span className="mr-1 text-[8px] uppercase tracking-wider text-muted-foreground">Explorer</span>
      <Button nativeButton={false} render={<Link href={`/workspaces/${workspaceId}/agents`}/>} size="sm" variant="ghost"><Users/>Équipe · {agents.length}</Button>
      <Button nativeButton={false} render={<Link href={`/workspaces/${workspaceId}/activity`}/>} size="sm" variant="ghost"><Activity/>Activité récente</Button>
      <Button nativeButton={false} render={<Link href={`/workspaces/${workspaceId}/artifacts`}/>} size="sm" variant="ghost">Livrables · {artifacts.length}</Button>
    </div>
  </>;
}
