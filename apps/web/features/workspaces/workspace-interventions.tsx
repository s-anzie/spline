"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CircleHelp,
  OctagonAlert,
  RefreshCw,
  Siren,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuestionsPanel } from "@/features/runtime/questions-panel";
import { usePlanningStore } from "@/stores/planning-store";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";

export function WorkspaceInterventions({ workspaceId }: { workspaceId: string }) {
  const { goals, tasks, loading: planLoading, load: loadPlan } = usePlanningStore();
  const {
    agents,
    locks,
    processes,
    questions,
    notifications,
    runtimeHealth,
    loading: domainLoading,
    load: loadDomain,
  } = useWorkspaceDomainStore();

  useEffect(() => {
    void loadPlan(workspaceId);
    void loadDomain(workspaceId);
  }, [loadDomain, loadPlan, workspaceId]);

  const blocked = [
    ...goals.filter(
      (goal) =>
        goal.status === "BLOCKED" || hasOpenBlocker(goal.blockers),
    ).map((goal) => ({ ...goal, kind: "GOAL" as const })),
    ...tasks.filter(
      (task) =>
        task.status === "BLOCKED" || hasOpenBlocker(task.blockers),
    ).map((task) => ({ ...task, kind: "TASK" as const })),
  ];
  const validations = [...goals, ...tasks].filter(
    (item) => item.validationState === "PENDING",
  );
  const humanQuestions = notifications.filter(
    (item) =>
      item.payload["collaborationType"] === "MANAGER_HUMAN_QUESTION" &&
      typeof item.payload["humanAnswer"] !== "string",
  );
  const openQuestions = questions.filter((item) => item.status === "OPEN");
  const crashedProcesses = processes.filter((process) => process.status === "CRASHED");
  const runtimeInterventions = [
    ...crashedProcesses.map((process) => {
      const heldLock = locks.find(
        (lock) =>
          lock.isHeld &&
          lock.resourceType === "PROCESS" &&
          lock.resourceId === process.id,
      );
      return {
        id: `process:${process.id}`,
        title: `Processus arrêté anormalement · ${process.name}`,
        detail: heldLock
          ? `Le processus est CRASHED et son verrou est encore détenu par ${heldLock.lockedByType.toLowerCase()} ${heldLock.lockedById}. Ouvrez sa fiche pour examiner les logs, libérer le verrou ou le relancer.`
          : "Le processus est CRASHED. Ouvrez sa fiche pour examiner les logs et choisir explicitement de le relancer.",
        href: `/workspaces/${workspaceId}/processes/${process.id}`,
      };
    }),
    ...(runtimeHealth?.machines.staleDetails.map((machine) => ({
      id: `machine:${machine.id}`,
      title: `Machine sans heartbeat · ${machine.hostname}`,
      detail: `Dernière activité ${machine.lastSeenAt ? new Date(machine.lastSeenAt).toLocaleString("fr-FR") : "inconnue"}. Vérifiez le daemon, sa connexion et les commandes en attente.`,
      href: `/infrastructure/${machine.id}?workspaceId=${workspaceId}&focus=machine`,
    })) ?? []),
    ...(runtimeHealth?.sessions.staleDetails.map((session) => ({
      id: `session:${session.id}`,
      title: `Session sans heartbeat · ${agents.find((agent) => agent.id === session.agentId)?.displayName ?? session.agentId}`,
      detail: `${session.provider} · état ${session.status} · dernier heartbeat ${session.lastHeartbeatAt ? new Date(session.lastHeartbeatAt).toLocaleString("fr-FR") : "inconnu"}. Inspectez la conversation avant de reprendre ou terminer la session.`,
      href: `/workspaces/${workspaceId}/execution?session=${session.id}`,
    })) ?? []),
    ...(runtimeHealth?.commands.stuckDetails.map((command) => ({
      id: `command:${command.id}`,
      title: `Commande bloquée · ${command.type}`,
      detail: `${command.hostname ?? command.machineId} · état ${command.status} · envoyée le ${new Date(command.createdAt).toLocaleString("fr-FR")}. Ouvrez la machine pour diagnostiquer la file d’exécution.`,
      href: `/infrastructure/${command.machineId}?workspaceId=${workspaceId}&focus=command:${command.id}`,
    })) ?? []),
  ];
  const runtimeIssues = runtimeInterventions.length;
  const total =
    blocked.length +
    validations.length +
    humanQuestions.length +
    openQuestions.length +
    runtimeIssues;
  const refresh = () => {
    void loadPlan(workspaceId, true);
    void loadDomain(workspaceId, true);
  };

  return (
    <>
      <PageHeader
        eyebrow="Centre d’intervention"
        title={total ? `${total} élément${total > 1 ? "s" : ""} à traiter` : "Aucune intervention requise"}
        description="Toutes les décisions humaines, validations, situations bloquées et anomalies qui empêchent le collectif d’avancer."
        actions={
          <LoadingButton loading={planLoading || domainLoading} onClick={refresh} variant="outline">
            <RefreshCw /> Actualiser
          </LoadingButton>
        }
      />

      <Tabs defaultValue={humanQuestions.length + openQuestions.length ? "questions" : validations.length ? "validations" : blocked.length ? "blockers" : "runtime"}>
        <TabsList className="mb-4 h-auto flex-wrap justify-start gap-1 bg-white/[.035] p-1.5">
          <TabsTrigger value="questions" className="gap-2"><CircleHelp />Questions {humanQuestions.length + openQuestions.length > 0 && <Badge className="border-[#f47b64]/25 bg-[#f47b64]/10 text-[#f47b64]" variant="outline">{humanQuestions.length + openQuestions.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="validations" className="gap-2"><BadgeCheck />À valider {validations.length > 0 && <Badge className="border-sky-400/20 bg-sky-400/[.07] text-sky-300" variant="outline">{validations.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="blockers" className="gap-2"><OctagonAlert />Blocages {blocked.length > 0 && <Badge className="border-amber-400/20 bg-amber-400/[.07] text-amber-300" variant="outline">{blocked.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="runtime" className="gap-2"><Siren />Alertes runtime {runtimeIssues > 0 && <Badge className="border-red-400/20 bg-red-400/[.07] text-red-300" variant="outline">{runtimeIssues}</Badge>}</TabsTrigger>
        </TabsList>
        <TabsContent value="questions"><QuestionsPanel /></TabsContent>
        <TabsContent value="validations">
          <InterventionList
            empty="Aucun résultat n’attend votre validation."
            tone="validation"
            items={validations.map((item) => ({ id: item.id, title: item.title, detail: `Validation ${item.validationState}`, href: `/workspaces/${workspaceId}/review?item=${item.id}` }))}
          />
        </TabsContent>
        <TabsContent value="blockers">
          <InterventionList
            empty="Aucune tâche bloquée."
            tone="blocker"
            items={blocked.map((item) => ({
              id: item.id,
              title: item.title,
              detail: blockerSummary(item.blockers),
              href: item.kind === "GOAL"
                ? `/workspaces/${workspaceId}/goals/${item.id}`
                : `/workspaces/${workspaceId}/tasks?task=${item.id}`,
            }))}
          />
        </TabsContent>
        <TabsContent value="runtime">
          <InterventionList
            empty="Aucun processus ni composant runtime ne requiert d’intervention."
            tone="runtime"
            items={runtimeInterventions}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function InterventionList({ items, empty, tone }: { items: Array<{ id: string; title: string; detail: string; href: string }>; empty: string; tone: "validation" | "blocker" | "runtime" }) {
  if (!items.length)
    return <Card className="border-dashed"><CardContent className="grid min-h-28 place-items-center text-center"><div><BadgeCheck className="mx-auto mb-2 size-5 text-emerald-400"/><p className="text-[10px] text-muted-foreground">{empty}</p></div></CardContent></Card>;
  const marker = tone === "validation" ? "bg-sky-300" : tone === "blocker" ? "bg-amber-300" : "bg-red-300";
  return <div className="grid gap-1.5">{items.map((item) => <Link key={item.id} href={item.href} className="group grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-white/[.065] bg-white/[.015] px-3 py-2.5 transition hover:border-white/[.12] hover:bg-white/[.03]"><span className={`size-2 shrink-0 rounded-full ${marker}`} /><div className="min-w-0"><h2 className="truncate text-[10px] font-medium">{item.title}</h2><p className="mt-0.5 truncate text-[8px] text-muted-foreground">{item.detail}</p></div><span className="flex items-center gap-1 text-[8px] text-muted-foreground transition group-hover:text-foreground">Ouvrir<ArrowRight className="size-3"/></span></Link>)}</div>;
}

function hasOpenBlocker(blockers: unknown[]) {
  return blockers.some((blocker) =>
    typeof blocker !== "object" || blocker === null
      ? true
      : !("resolvedAt" in blocker) || !blocker.resolvedAt,
  );
}

function blockerSummary(blockers: unknown[]) {
  const reasons = blockers
    .filter((blocker) =>
      typeof blocker !== "object" || blocker === null
        ? true
        : !("resolvedAt" in blocker) || !blocker.resolvedAt,
    )
    .map((blocker) => {
      if (typeof blocker === "string") return blocker;
      if (typeof blocker === "object" && blocker !== null && "reason" in blocker)
        return String(blocker.reason);
      return "Blocage déclaré sans précision";
    });
  return reasons.join(" · ") || "Élément marqué comme bloqué";
}
