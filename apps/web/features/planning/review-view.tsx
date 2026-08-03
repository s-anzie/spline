"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Check, CheckCircle2, FileCheck2, RefreshCw, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { usePlanningStore } from "@/stores/planning-store";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";

export function ReviewView({ workspaceId, initialItemId }: { workspaceId: string; initialItemId?: string }) {
  const { goals, tasks, loading, mutating, error, load, goalAction, taskAction } = usePlanningStore();
  const { artifacts, decisions, load: loadDomain } = useWorkspaceDomainStore();
  const [selected, setSelected] = useState<string | null>(initialItemId ?? null);
  useEffect(() => { void load(workspaceId); void loadDomain(workspaceId); }, [load, loadDomain, workspaceId]);
  const candidates = [
    ...goals.filter((item) => item.validationState === "PENDING").map((item) => ({ ...item, kind: "GOAL" as const })),
    ...tasks.filter((item) => item.validationState === "PENDING").map((item) => ({ ...item, kind: "TASK" as const, successCriteria: [] as unknown[] })),
  ];
  const current = candidates.find((item) => item.id === selected) ?? candidates[0];
  const evidence = current ? artifacts.filter((artifact) => current.kind === "GOAL" ? artifact.goalId === current.id : artifact.taskId === current.id) : [];
  const relatedDecisions = current ? decisions.filter((decision) => decision.references.includes(current.id)) : [];
  const blockers = current?.blockers ?? [];
  const act = (action: "validate" | "reject") => current && (current.kind === "GOAL" ? goalAction(current.id, action) : taskAction(current.id, action));

  return <>
    <PageHeader eyebrow="Contrôle humain" title="Revue" description="Examiner le résultat, ses preuves et ses risques avant de l’accepter ou de le renvoyer au collectif." actions={<><Button nativeButton={false} render={<Link href={`/workspaces/${workspaceId}/decisions`}/>} variant="outline">Journal des décisions</Button><LoadingButton loading={loading} onClick={() => { void load(workspaceId, true); void loadDomain(workspaceId, true); }} size="icon-lg" variant="outline"><RefreshCw/></LoadingButton></>}/>
    {error && <p className="mb-4 text-[10px] text-red-300">{error}</p>}
    {current ? <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="grid content-start gap-2">{candidates.map((candidate) => <button key={candidate.id} onClick={() => setSelected(candidate.id)} className={`rounded-xl border p-4 text-left transition ${current.id === candidate.id ? "border-[#f47b64]/30 bg-[#f47b64]/[.065]" : "border-white/[.06] bg-white/[.015] hover:bg-white/[.025]"}`}><div className="flex items-center justify-between gap-2"><Badge variant="outline">{candidate.kind === "GOAL" ? "Objectif" : "Tâche"}</Badge><span className="text-[8px] text-muted-foreground">{candidate.priority}</span></div><h2 className="mt-3 line-clamp-2 text-xs leading-5">{candidate.title}</h2><p className="mt-2 text-[8px] text-muted-foreground">Mis à jour {new Date(candidate.updatedAt).toLocaleString("fr-FR")}</p></button>)}</aside>
      <Card className="border-white/[.08] bg-white/[.018]"><CardContent className="p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex gap-2"><Badge variant="outline">{current.kind === "GOAL" ? "Objectif" : "Tâche"}</Badge><Badge variant="outline">{current.status}</Badge></div><h2 className="mt-4 text-lg">{current.title}</h2><p className="mt-2 max-w-3xl text-[10px] leading-5 text-muted-foreground">{current.description || "Aucune description fournie."}</p></div><Button nativeButton={false} render={<Link href={current.kind === "GOAL" ? `/workspaces/${workspaceId}/goals/${current.id}` : `/workspaces/${workspaceId}/tasks?task=${current.id}`}/>} size="sm" variant="outline">Ouvrir<ArrowUpRight/></Button></div>
        <div className="mt-7 grid gap-3 md:grid-cols-3"><section className="rounded-xl border border-white/[.06] p-4"><h3 className="text-[9px] uppercase tracking-wider text-muted-foreground">Critères de succès</h3><strong className="mt-2 block text-xl">{current.successCriteria.length}</strong><p className="text-[8px] text-muted-foreground">critère(s) documenté(s)</p></section><section className="rounded-xl border border-white/[.06] p-4"><h3 className="text-[9px] uppercase tracking-wider text-muted-foreground">Preuves liées</h3><strong className="mt-2 block text-xl">{evidence.length}</strong><p className="text-[8px] text-muted-foreground">artefact(s) vérifiable(s)</p></section><section className="rounded-xl border border-white/[.06] p-4"><h3 className="text-[9px] uppercase tracking-wider text-muted-foreground">Risques ouverts</h3><strong className="mt-2 block text-xl">{blockers.length}</strong><p className="text-[8px] text-muted-foreground">blocage(s) déclaré(s)</p></section></div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2"><section><h3 className="mb-2 text-[9px] uppercase tracking-wider text-muted-foreground">Dossier de preuve</h3><div className="grid gap-2">{evidence.map((artifact) => <Link key={artifact.id} href={`/workspaces/${workspaceId}/artifacts/${artifact.id}`} className="flex items-center gap-3 rounded-lg border border-white/[.06] p-3 transition hover:bg-white/[.025]"><FileCheck2 className="size-4 text-emerald-400"/><span className="min-w-0 flex-1 truncate text-[10px]">{artifact.name}</span><Badge variant="outline">v{artifact.version}</Badge></Link>)}{!evidence.length && <p className="rounded-lg border border-dashed border-amber-400/15 p-3 text-[9px] text-amber-200/70">Aucune preuve attachée : validez uniquement si le résultat est vérifiable autrement.</p>}</div></section><section><h3 className="mb-2 text-[9px] uppercase tracking-wider text-muted-foreground">Décisions associées</h3><div className="grid gap-2">{relatedDecisions.map((decision) => <div key={decision.id} className="rounded-lg border border-white/[.06] p-3"><p className="text-[10px]">{decision.subject}</p><p className="mt-1 line-clamp-2 text-[8px] text-muted-foreground">{decision.decision}</p></div>)}{!relatedDecisions.length && <p className="rounded-lg border border-dashed border-white/[.06] p-3 text-[9px] text-muted-foreground">Aucune décision explicitement liée.</p>}</div></section></div>
        <div className="mt-7 flex flex-col gap-2 border-t border-white/[.06] pt-5 sm:flex-row sm:justify-end"><LoadingButton loading={mutating} onClick={() => void act("reject")} variant="destructive"><X/>Renvoyer pour correction</LoadingButton><LoadingButton loading={mutating} onClick={() => void act("validate")} className="bg-emerald-500 text-[#07130c]"><Check/>Accepter le résultat</LoadingButton></div>
      </CardContent></Card>
    </div> : !loading && <Card className="border-dashed"><CardContent className="grid min-h-64 place-items-center text-center"><div><CheckCircle2 className="mx-auto size-8 text-emerald-400"/><h2 className="mt-3 text-sm">File de revue vide</h2><p className="mt-1 text-[10px] text-muted-foreground">Aucun résultat n’attend votre décision.</p></div></CardContent></Card>}
  </>;
}
