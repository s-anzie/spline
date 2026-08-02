"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, Ban, Bot, Check, Clock3, Copy, Cpu, HardDrive, KeyRound, Network, Radio, RefreshCw, ShieldCheck, Terminal, TriangleAlert, WifiOff, Wrench } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { LiveIndicator } from "@/components/shared/live-indicator";
import { PageHeader } from "@/components/shared/page-header";
import { domainApi } from "@/lib/api/domains";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

const ACTIVE_SESSION_STATUSES = ["STARTING", "RUNNING", "AWAITING_APPROVAL"];

export function MachineDetail({ machineId }: { machineId: string }) {
  const workspaceId = useSearchParams().get("workspaceId");
  const { machines, sessions, agents, processes, runtimeHealth, loading, error, load } = useWorkspaceDomainStore();
  const { workspaces, loadWorkspaces } = useWorkspaceStore();
  const authToken = useAuthStore((state) => state.token);
  const [credentialAction, setCredentialAction] = useState<"rotate" | "revoke" | null>(null);
  const [credentialPending, setCredentialPending] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { void loadWorkspaces(); if (workspaceId) void load(workspaceId); }, [load, loadWorkspaces, workspaceId]);

  const machine = machines.find((item) => item.id === machineId);
  const machineSessions = useMemo(() => sessions.filter((session) => session.machineId === machineId).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [machineId, sessions]);
  const activeSessions = machineSessions.filter((session) => ACTIVE_SESSION_STATUSES.includes(session.status));
  const machineProcesses = processes.filter((process) => process.machineId === machineId);
  const staleDetail = runtimeHealth?.machines.staleDetails.find((item) => item.id === machineId);
  const staleSessionIds = new Set(runtimeHealth?.sessions.staleDetails.filter((item) => machineSessions.some((session) => session.id === item.id)).map((item) => item.id) ?? []);
  const stuckCommands = runtimeHealth?.commands.stuckDetails.filter((command) => command.machineId === machineId) ?? [];

  async function manageCredential() {
    if (!authToken || !workspaceId || !credentialAction) return;
    setCredentialPending(true);
    try {
      if (credentialAction === "rotate") {
        const result = await domainApi.rotateMachineToken(workspaceId, machineId, authToken);
        setRevealedToken(result.token);
      } else {
        await domainApi.revokeMachineToken(workspaceId, machineId, authToken);
        setRevealedToken(null);
      }
      setCredentialAction(null);
      void load(workspaceId, true);
    } finally { setCredentialPending(false); }
  }

  async function copyToken() {
    if (!revealedToken) return;
    await navigator.clipboard.writeText(revealedToken);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (!workspaceId) return <Card><CardContent className="grid min-h-52 place-items-center p-6 text-center"><div><Network className="mx-auto size-7 text-muted-foreground"/><h1 className="mt-3 text-sm">Contexte du workspace manquant</h1><Button nativeButton={false} render={<Link href="/infrastructure"/>} className="mt-4" variant="outline"><ArrowLeft/>Retour à l’infrastructure</Button></div></CardContent></Card>;
  if (loading && !machine) return <div className="grid min-h-64 place-items-center text-xs text-muted-foreground"><span className="size-5 animate-spin rounded-full border-2 border-white/10 border-t-cyan-300"/></div>;
  if (!machine) return <Card><CardContent className="p-6 text-xs">{error || "Machine introuvable"}</CardContent></Card>;

  const isStale = Boolean(staleDetail);
  const isOnline = machine.runtimeStatus === "ONLINE" && !isStale;
  const tone = isOnline ? "healthy" : "warning";
  const toneLabel = isStale ? "Connexion périmée" : isOnline ? "Daemon connecté" : "Daemon hors ligne";
  const recommendation = isStale
    ? "Le daemon ne donne plus signe de vie. Vérifiez le service local avant de relancer du travail."
    : !isOnline
      ? "Démarrez le service Spline sur cette machine pour qu’elle puisse recevoir des sessions."
      : stuckCommands.length
        ? "La machine répond, mais une commande attend trop longtemps : inspectez-la avant un nouvel envoi."
        : activeSessions.length
          ? `${activeSessions.length} session(s) travaillent actuellement sur cette machine.`
          : "La machine est disponible et prête à recevoir du travail.";

  return <>
    <Button nativeButton={false} render={<Link href="/infrastructure"/>} variant="ghost" size="sm" className="mb-5 text-muted-foreground"><ArrowLeft/>Infrastructure</Button>
    <PageHeader eyebrow={`Machine locale · ${machine.os}`} title={machine.hostname} description="Comprendre sa disponibilité, ce qu’elle exécute et les interventions nécessaires." actions={<><LiveIndicator tone={tone} label={toneLabel}/><LoadingButton loading={loading} onClick={() => void load(workspaceId, true)} size="icon-lg" variant="outline" aria-label="Actualiser"><RefreshCw/></LoadingButton></>}/>

    <Card className={`mb-4 overflow-hidden ${isOnline ? "border-emerald-400/15 bg-emerald-400/[.035]" : "border-amber-400/20 bg-amber-400/[.045]"}`}><CardContent className="grid gap-5 p-5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"><span className={`grid size-12 place-items-center rounded-2xl ${isOnline ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{isOnline ? <Radio className="size-5"/> : <WifiOff className="size-5"/>}</span><div><p className="text-[8px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Diagnostic immédiat</p><h2 className="mt-1 text-sm">{toneLabel}</h2><p className="mt-1 text-[10px] leading-5 text-muted-foreground">{recommendation}</p></div>{!isOnline && <Button nativeButton={false} render={<Link href="/infrastructure"/>} variant="outline">Voir l’installation du daemon<ArrowRight/></Button>}</CardContent></Card>

    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      { label:"Dernier signal", value:machine.lastSeenAt ? new Date(machine.lastSeenAt).toLocaleTimeString("fr-FR", {hour:"2-digit",minute:"2-digit"}) : "Jamais", detail:machine.lastSeenAt ? new Date(machine.lastSeenAt).toLocaleDateString("fr-FR") : "Aucun heartbeat", icon:Activity },
      { label:"Travail en cours", value:String(activeSessions.length), detail:`${machineSessions.length} session(s) au total`, icon:Bot },
      { label:"Services", value:String(machineProcesses.filter((item) => item.status === "RUNNING").length), detail:`${machineProcesses.length} process enregistré(s)`, icon:Cpu },
      { label:"Incidents", value:String(stuckCommands.length + staleSessionIds.size), detail:"commandes ou sessions à vérifier", icon:TriangleAlert },
    ].map(({label,value,detail,icon:Icon}) => <Card key={label} className="border-white/[.07] bg-white/[.015]"><CardContent className="flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-white/[.035]"><Icon className="size-4 text-cyan-300"/></span><div><p className="text-[8px] text-muted-foreground">{label}</p><strong className="text-lg">{value}</strong><p className="text-[8px] text-muted-foreground">{detail}</p></div></CardContent></Card>)}</div>

    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,.75fr)]">
      <div className="grid gap-4">
        <Card className="border-white/[.075] bg-white/[.018]"><CardContent className="p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Terminal className="size-4 text-cyan-300"/><h2 className="text-sm">Ce qui s’exécute maintenant</h2></div><Badge variant="outline">{activeSessions.length + machineProcesses.filter((item) => item.status === "RUNNING").length} actif(s)</Badge></div><div className="mt-4 grid gap-2">
          {activeSessions.map((session) => { const agent = agents.find((item) => item.id === session.agentId); return <Link key={session.id} href={`/workspaces/${workspaceId}/execution?session=${session.id}`} className="grid gap-3 rounded-xl border border-white/[.06] p-3.5 transition hover:border-cyan-300/20 hover:bg-white/[.025] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"><span className="relative grid size-9 place-items-center rounded-full bg-cyan-400/10"><Bot className="size-4 text-cyan-300"/><span className="absolute right-0 top-0 size-2 rounded-full bg-emerald-400"/></span><div className="min-w-0"><strong className="block truncate text-[10px]">{agent?.displayName ?? session.agentId}</strong><p className="mt-1 truncate text-[8px] text-muted-foreground">{session.provider} · activité {new Date(session.updatedAt).toLocaleString("fr-FR")}</p></div><Badge variant="outline">{session.status}</Badge></Link>; })}
          {machineProcesses.filter((item) => item.status === "RUNNING").map((process) => <Link key={process.id} href={`/workspaces/${workspaceId}/processes/${process.id}`} className="grid gap-3 rounded-xl border border-white/[.06] p-3.5 transition hover:border-cyan-300/20 hover:bg-white/[.025] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"><span className="grid size-9 place-items-center rounded-lg bg-violet-400/10"><Cpu className="size-4 text-violet-300"/></span><div className="min-w-0"><strong className="block truncate text-[10px]">{process.name}</strong><code className="mt-1 block truncate text-[8px] text-muted-foreground">{process.command}</code></div><Badge variant="outline">{process.ports.length ? process.ports.map((port) => `:${port}`).join(" · ") : "Sans port"}</Badge></Link>)}
          {!activeSessions.length && !machineProcesses.some((item) => item.status === "RUNNING") && <div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-white/[.07] text-center"><div><HardDrive className="mx-auto size-6 text-muted-foreground"/><p className="mt-2 text-[10px]">Aucun travail en cours sur cette machine.</p><p className="mt-1 text-[8px] text-muted-foreground">Elle est {isOnline ? "disponible" : "indisponible"} pour une prochaine session.</p></div></div>}
        </div></CardContent></Card>

        <Card className="border-white/[.075] bg-white/[.018]"><CardContent className="p-5"><div className="flex items-center gap-2"><Clock3 className="size-4 text-cyan-300"/><h2 className="text-sm">Historique d’utilisation</h2><Badge variant="outline" className="ml-auto">{machineSessions.length}</Badge></div><div className={`mt-4 grid gap-2 ${machineSessions.length > 6 ? "max-h-[25rem] overflow-y-auto overscroll-contain pr-1" : ""}`}>{machineSessions.map((session) => { const agent = agents.find((item) => item.id === session.agentId); return <Link key={session.id} href={`/workspaces/${workspaceId}/execution?session=${session.id}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-white/[.05] p-3 transition hover:bg-white/[.02]"><span className={`size-2 rounded-full ${staleSessionIds.has(session.id) ? "bg-amber-300" : session.status === "COMPLETED" ? "bg-emerald-400" : "bg-white/25"}`}/><div className="min-w-0"><strong className="block truncate text-[9px]">{agent?.displayName ?? session.agentId}</strong><span className="text-[8px] text-muted-foreground">{new Date(session.startedAt).toLocaleString("fr-FR")}</span></div><Badge variant="outline">{staleSessionIds.has(session.id) ? "PÉRIMÉE" : session.status}</Badge></Link>; })}{!machineSessions.length && <p className="py-8 text-center text-[10px] text-muted-foreground">Cette machine n’a encore hébergé aucune session.</p>}</div></CardContent></Card>
      </div>

      <aside className="grid gap-4 xl:sticky xl:top-24">
        <Card className="border-white/[.075] bg-white/[.018]"><CardContent className="p-5"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-cyan-300"/><h2 className="text-sm">Identité et périmètre</h2></div><dl className="mt-4 grid gap-3 text-[9px]"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Système</dt><dd className="text-right">{machine.os}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Identifiant</dt><dd className="max-w-40 truncate font-mono" title={machine.id}>{machine.id}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Enregistrée</dt><dd>{new Date(machine.createdAt).toLocaleDateString("fr-FR")}</dd></div></dl><div className="mt-5 border-t border-white/[.055] pt-4"><p className="mb-2 text-[8px] uppercase tracking-wider text-muted-foreground">Workspaces autorisés</p><div className="flex flex-wrap gap-2">{machine.workspaceIds.map((id) => <Link key={id} href={`/workspaces/${id}`}><Badge variant="outline" className="transition hover:border-cyan-300/30 hover:text-cyan-200">{workspaces.find((item) => item.id === id)?.name ?? id.slice(0,8)}</Badge></Link>)}</div></div></CardContent></Card>

        <Card className="border-white/[.075] bg-white/[.018]"><CardContent className="p-5"><div className="flex items-center gap-2"><KeyRound className="size-4 text-cyan-300"/><h2 className="text-sm">Accès du daemon</h2></div><p className="mt-3 text-[9px] leading-5 text-muted-foreground">Le token identifie uniquement cette machine. Le renouveler déconnecte immédiatement l’ancien daemon.</p><div className="mt-4 grid gap-2"><Button variant="outline" size="sm" onClick={() => setCredentialAction("rotate")}><KeyRound/>Renouveler le token</Button><Button variant="ghost" size="sm" className="text-red-300 hover:bg-red-400/10" onClick={() => setCredentialAction("revoke")}><Ban/>Révoquer l’accès</Button></div>{revealedToken && <div className="mt-4 animate-in fade-in slide-in-from-top-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[.055] p-3"><p className="text-[9px] text-emerald-300">Copiez ce token maintenant.</p><code className="mt-2 block max-h-24 overflow-y-auto break-all rounded-md bg-black/20 p-2 text-[8px]">{revealedToken}</code><Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => void copyToken()}>{copied ? <Check/> : <Copy/>}{copied ? "Copié" : "Copier"}</Button></div>}</CardContent></Card>

        <Card className={`${stuckCommands.length || staleSessionIds.size ? "border-amber-400/20 bg-amber-400/[.035]" : "border-white/[.075] bg-white/[.018]"}`}><CardContent className="p-5"><div className="flex items-center gap-2"><Wrench className="size-4 text-amber-300"/><h2 className="text-sm">Interventions</h2><Badge variant="outline" className="ml-auto">{stuckCommands.length + staleSessionIds.size}</Badge></div><div className={`mt-4 grid gap-2 ${stuckCommands.length > 4 ? "max-h-56 overflow-y-auto overscroll-contain pr-1" : ""}`}>{stuckCommands.map((command) => <div key={command.id} className="rounded-lg border border-amber-400/15 p-3"><div className="flex items-center justify-between gap-2"><strong className="text-[9px]">{command.type}</strong><Badge variant="outline">{command.status}</Badge></div><p className="mt-1 text-[8px] text-muted-foreground">En attente depuis {new Date(command.createdAt).toLocaleString("fr-FR")}</p></div>)}{!stuckCommands.length && !staleSessionIds.size && <div className="py-4 text-center"><Check className="mx-auto size-5 text-emerald-400"/><p className="mt-2 text-[9px] text-muted-foreground">Aucune intervention nécessaire.</p></div>}{staleSessionIds.size > 0 && <p className="rounded-lg border border-amber-400/15 p-3 text-[9px] text-amber-200">{staleSessionIds.size} session(s) sans heartbeat récent.</p>}</div></CardContent></Card>
      </aside>
    </div>

    {error && <p className="mt-4 text-[10px] text-red-300">{error}</p>}
    <AlertDialog open={credentialAction !== null} onOpenChange={(open) => !open && setCredentialAction(null)}><AlertDialogContent className="border-white/10 bg-[#191715] text-foreground"><AlertDialogHeader><AlertDialogTitle>{credentialAction === "rotate" ? "Renouveler ce token ?" : "Révoquer cet accès ?"}</AlertDialogTitle><AlertDialogDescription>{credentialAction === "rotate" ? "L’ancien token sera invalidé et le daemon déconnecté. Vous devrez appliquer le nouveau token au service local." : "La machine ne pourra plus recevoir de travail avant la création d’un nouvel accès."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={credentialPending}>Annuler</AlertDialogCancel><AlertDialogAction onClick={() => void manageCredential()} disabled={credentialPending} variant={credentialAction === "revoke" ? "destructive" : "default"}>{credentialPending ? "Traitement…" : "Confirmer"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
