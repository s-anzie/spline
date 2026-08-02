"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, CircleDashed, RefreshCw, Target } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { Progress } from "@/components/ui/progress";
import { usePlanningStore } from "@/stores/planning-store";
import { NewGoalDialog } from "./new-goal-dialog";

export function GoalsPortfolio({ workspaceId }: { workspaceId: string }) {
  const { goals, tasks, loading, error, load } = usePlanningStore();
  useEffect(() => { void load(workspaceId); }, [load, workspaceId]);
  const stats = useMemo(() => ({
    active: goals.filter((goal) => ["ACTIVE", "AT_RISK", "BLOCKED"].includes(goal.status)).length,
    atRisk: goals.filter((goal) => ["AT_RISK", "BLOCKED"].includes(goal.status)).length,
    completed: goals.filter((goal) => goal.status === "COMPLETED").length,
  }), [goals]);

  return <>
    <PageHeader eyebrow="Portefeuille de résultats" title="Objectifs" description="Décider où va le workspace, mesurer les résultats attendus et détecter ce qui compromet leur réussite." actions={<><LoadingButton loading={loading} onClick={() => void load(workspaceId, true)} size="icon-lg" variant="outline"><RefreshCw /></LoadingButton><NewGoalDialog workspaceId={workspaceId}/></>}/>
    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      {[{ label:"En mouvement", value:stats.active, icon:Target, tone:"text-[#f47b64]" },{ label:"À risque", value:stats.atRisk, icon:AlertTriangle, tone:"text-amber-300" },{ label:"Atteints", value:stats.completed, icon:CheckCircle2, tone:"text-emerald-400" }].map(({label,value,icon:Icon,tone}) => <Card key={label} className="bg-white/[.015]"><CardContent className="flex items-center gap-4 p-4"><span className="grid size-9 place-items-center rounded-lg bg-white/[.035]"><Icon className={`size-4 ${tone}`}/></span><div><strong className="text-xl">{value}</strong><p className="text-[9px] text-muted-foreground">{label}</p></div></CardContent></Card>)}
    </div>
    {error && <p className="mb-4 text-[10px] text-red-300">{error}</p>}
    <div className="grid gap-3 lg:grid-cols-2">
      {goals.map((goal) => { const linked = tasks.filter((task) => task.goalId === goal.id); const done = linked.filter((task) => task.status === "DONE").length; return <Card key={goal.id} className="group overflow-hidden border-white/[.07] bg-white/[.018] transition hover:-translate-y-0.5 hover:border-white/[.12]">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="mb-3 flex flex-wrap gap-2"><Badge variant="outline">{goal.priority}</Badge><Badge variant="outline">{goal.status}</Badge></div><h2 className="text-sm font-medium">{goal.title}</h2><p className="mt-2 line-clamp-2 text-[10px] leading-5 text-muted-foreground">{goal.description || "Aucun contexte documenté."}</p></div><Button nativeButton={false} render={<Link href={`/workspaces/${workspaceId}/goals/${goal.id}`}/>} size="icon-sm" variant="ghost"><ArrowRight/></Button></div>
          <div className="mt-5 flex items-center gap-3"><Progress value={goal.progressPercentage}/><strong className="text-xs">{goal.progressPercentage}%</strong></div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[.055] pt-4"><div className="flex items-center gap-2 text-[9px] text-muted-foreground"><CircleDashed className="size-3.5"/>{done}/{linked.length} tâches terminées</div><div className="flex items-center justify-end gap-2 text-[9px] text-muted-foreground"><CalendarDays className="size-3.5"/>{goal.dueDate ? new Date(goal.dueDate).toLocaleDateString("fr-FR") : "Sans échéance"}</div></div>
        </CardContent>
      </Card>; })}
    </div>
    {!loading && !goals.length && <Card className="border-dashed"><CardContent className="grid min-h-56 place-items-center text-center"><div><Target className="mx-auto size-7 text-[#f47b64]"/><h2 className="mt-3 text-sm">Aucun résultat attendu</h2><p className="mt-1 text-[10px] text-muted-foreground">Créez un objectif avant d’organiser les tâches.</p></div></CardContent></Card>}
  </>;
}
