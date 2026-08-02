"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertCircle, ArrowRight, CalendarDays, CheckCircle2, Circle, ListTree, RefreshCw, Rows3, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import type { GoalStatus, TaskStatus } from "@/lib/api/types";
import { usePlanningStore } from "@/stores/planning-store";
import { NewGoalDialog } from "./new-goal-dialog";

const goalLabels: Record<GoalStatus, string> = { PLANNED:"Planifié", ACTIVE:"Actif", BLOCKED:"Bloqué", AT_RISK:"À risque", REVIEW:"En revue", COMPLETED:"Terminé", CANCELLED:"Annulé" };
const taskLabels: Record<TaskStatus, string> = { BACKLOG:"Backlog", TODO:"À faire", IN_PROGRESS:"En cours", BLOCKED:"Bloqué", IN_REVIEW:"En revue", DONE:"Terminé", CANCELLED:"Annulé" };
const columns: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"];

export function IntegratedPlan({ workspaceId }: { workspaceId: string }) {
  const { goals, tasks, loading, error, load } = usePlanningStore();
  useEffect(() => { void load(workspaceId); }, [load, workspaceId]);
  return <><PageHeader eyebrow="Trajectoire d’exécution" title="Plan" description="Relier les résultats attendus au travail à réaliser et suivre leur progression dans un même parcours." actions={<><Button nativeButton={false} render={<Link href={`/workspaces/${workspaceId}/goals`}/>} variant="outline">Objectifs</Button><Button nativeButton={false} render={<Link href={`/workspaces/${workspaceId}/tasks`}/>} variant="outline">Toutes les tâches</Button><LoadingButton loading={loading} onClick={() => void load(workspaceId, true)} size="icon-lg" variant="outline" aria-label="Actualiser"><RefreshCw/></LoadingButton><NewGoalDialog workspaceId={workspaceId}/></>}/>
    {loading && <div className="grid min-h-64 place-items-center"><div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="size-4 animate-spin rounded-full border-2 border-white/10 border-t-[#f47b64]"/>Chargement du plan…</div></div>}
    {!loading && error && <Card className="border-red-400/15 bg-red-400/[.04]"><CardContent className="flex items-center gap-4 p-5"><AlertCircle className="text-red-300"/><div className="flex-1"><h2 className="text-sm">Plan indisponible</h2><p className="text-[10px] text-muted-foreground">{error}</p></div><Button onClick={() => void load(workspaceId, true)} variant="outline">Réessayer</Button></CardContent></Card>}
    {!loading && !error && <Tabs defaultValue="hierarchy"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><TabsList className="bg-white/[.035]"><TabsTrigger value="hierarchy"><ListTree/>Hiérarchie</TabsTrigger><TabsTrigger value="board"><Rows3/>Kanban</TabsTrigger></TabsList><div className="flex gap-2"><Badge variant="outline">{goals.length} objectifs</Badge><Badge variant="outline">{tasks.filter((task) => task.status !== "DONE" && task.status !== "CANCELLED").length} tâches ouvertes</Badge></div></div>
      <TabsContent value="hierarchy" className="grid gap-3">{goals.length === 0 && <Card className="border-dashed border-white/10 bg-white/[.012]"><CardContent className="grid min-h-60 place-items-center text-center"><div><Target className="mx-auto size-7 text-[#f47b64]"/><h2 className="mt-4 text-sm">Aucun objectif</h2><p className="mt-1 text-[10px] text-muted-foreground">Donnez un premier résultat à atteindre pour structurer le travail.</p></div></CardContent></Card>}{goals.map((goal, index) => { const linked = tasks.filter((task) => task.goalId === goal.id); return <Card key={goal.id} className="border-white/[.075] bg-white/[.018]"><CardContent className="p-0"><div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center"><span className="grid size-9 place-items-center rounded-lg bg-[#f47b64]/10 text-[10px] font-semibold text-[#f47b64]">{String(index + 1).padStart(2,"0")}</span><div className="min-w-0 flex-1"><Link href={`/workspaces/${workspaceId}/goals/${goal.id}`} className="text-sm font-medium hover:text-[#f47b64]">{goal.title}</Link><div className="mt-2 flex items-center gap-3"><Progress value={goal.progressPercentage}/><span className="text-[9px] text-muted-foreground">{goal.progressPercentage}%</span></div></div><Badge variant="outline">{goalLabels[goal.status]}</Badge><span className="flex items-center gap-1 text-[9px] text-muted-foreground"><CalendarDays className="size-3"/>{goal.dueDate ? new Intl.DateTimeFormat("fr-FR").format(new Date(goal.dueDate)) : "Sans échéance"}</span><Button nativeButton={false} render={<Link href={`/workspaces/${workspaceId}/goals/${goal.id}`}/>} size="icon-sm" variant="ghost"><ArrowRight/></Button></div>{linked.length > 0 && <div className="grid gap-2 border-t border-white/[.055] bg-black/10 p-4 md:grid-cols-2">{linked.map(task => <div key={task.id} className="flex items-center gap-2 rounded-lg border border-white/[.05] p-2.5">{task.status === "DONE" ? <CheckCircle2 className="size-3.5 text-emerald-400"/> : <Circle className="size-3.5 text-muted-foreground"/>}<span className="flex-1 truncate text-[10px]">{task.title}</span><Badge variant="outline" className="text-[7px]">{taskLabels[task.status]}</Badge></div>)}</div>}</CardContent></Card>;})}</TabsContent>
      <TabsContent value="board"><div className="grid gap-3 lg:grid-cols-4">{columns.map(status => <section key={status} className="min-h-80 rounded-xl border border-white/[.06] bg-white/[.012] p-3"><h2 className="mb-3 flex justify-between text-xs">{taskLabels[status]}<Badge>{tasks.filter(task => task.status === status).length}</Badge></h2><div className="grid gap-2">{tasks.filter(task => task.status === status).map(task => <Card key={task.id} className="bg-[#181614]"><CardContent className="p-3"><h3 className="text-[10px] leading-4">{task.title}</h3><p className="mt-3 text-[8px] text-muted-foreground">{task.priority} · {task.assigneeId ? "Assignée" : "Non assignée"}</p></CardContent></Card>)}</div></section>)}</div></TabsContent>
    </Tabs>}
  </>;
}
