"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  Bot,
  Check,
  Clock,
  History,
  ListFilter,
  MessageCircleQuestion,
  RefreshCw,
  RotateCcw,
  Square,
  Terminal,
  TriangleAlert,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { LiveIndicator } from "@/components/shared/live-indicator";
import { LaunchSessionDialog } from "@/features/workspaces/launch-session-dialog";
import { usePlanningStore } from "@/stores/planning-store";
import { useRealtimeStore } from "@/stores/realtime-store";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";
import { ProcessesView } from "./processes-view";
import { LocksPanel } from "./locks-panel";
import { SessionConsole } from "./session-console";
import { QuestionsPanel } from "./questions-panel";
export function ExecutionView({ workspaceId }: { workspaceId: string }) {
  const requestedSessionId = useSearchParams().get("session");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState<
    "working" | "idle" | "history" | "all"
  >("working");
  const {
    sessions,
    questions,
    agents,
    runtimeHealth,
    loading,
    pendingAction,
    error,
    load,
    sessionAction,
    startSession,
  } = useWorkspaceDomainStore();
  const loadPlan = usePlanningStore((s) => s.load);
  const tasks = usePlanningStore((s) => s.tasks);
  const connected = useRealtimeStore((s) => s.connected);
  const runtimeIssueCount = runtimeHealth
    ? runtimeHealth.machines.stale + runtimeHealth.sessions.stale + runtimeHealth.commands.stuck
    : 0;
  const workingStatuses = ["STARTING", "RUNNING", "AWAITING_APPROVAL"];
  const activeSessionCount = sessions.filter((session) => workingStatuses.includes(session.status)).length;
  const idleSessionCount = sessions.filter((session) => session.status === "IDLE").length;
  const historicalSessionCount = sessions.filter((session) => Boolean(session.endedAt)).length;
  const filteredSessions = sessions.filter((session) =>
    sessionFilter === "all"
      ? true
      : sessionFilter === "working"
        ? workingStatuses.includes(session.status)
        : sessionFilter === "idle"
          ? session.status === "IDLE"
          : !!session.endedAt,
  );
  const selectedTurns = useMemo(() => {
    const turns: typeof sessions = [];
    let cursor = sessions.find((session) => session.id === selectedSessionId);
    while (cursor) {
      turns.unshift(cursor);
      const parentId: string | null = cursor.resumedFromSessionId;
      cursor = parentId
        ? sessions.find((session) => session.id === parentId)
        : undefined;
    }
    return turns;
  }, [selectedSessionId, sessions]);
  function changeSessionFilter(next: "working" | "idle" | "history" | "all") {
    setSessionFilter(next);
    if (
      selectedSessionId &&
      !sessions.some(
        (session) =>
          session.id === selectedSessionId &&
          (next === "all" ||
            (next === "working" ? workingStatuses.includes(session.status) : next === "idle" ? session.status === "IDLE" : !!session.endedAt)),
      )
    ) {
      setSelectedSessionId(null);
    }
  }
  useEffect(() => {
    void load(workspaceId);
    void loadPlan(workspaceId);
  }, [load, loadPlan, workspaceId]);
  useEffect(() => {
    if (
      requestedSessionId &&
      sessions.some((session) => session.id === requestedSessionId)
    ) {
      setSessionFilter("all");
      setSelectedSessionId(requestedSessionId);
    }
  }, [requestedSessionId, sessions]);
  return (
    <>
      <PageHeader
        eyebrow="Runtime du workspace"
        title="Exécution"
        description="Sessions, approbations et processus pilotés par l’état réel du backend."
        actions={
          <>
            <LiveIndicator
              label={
                connected ? "Temps réel connecté" : "Temps réel hors ligne"
              }
            />
            {runtimeHealth && (
              <LiveIndicator
                tone={runtimeIssueCount > 0 ? "warning" : "healthy"}
                label={
                  runtimeIssueCount > 0
                    ? `${runtimeIssueCount} anomalie${runtimeIssueCount > 1 ? "s" : ""} runtime`
                    : "Runtime sain"
                }
              />
            )}
            <LoadingButton
              loading={loading}
              onClick={() => void load(workspaceId, true)}
              size="icon-lg"
              variant="outline"
            >
              <RefreshCw />
            </LoadingButton>
            <LaunchSessionDialog />
          </>
        }
      />
      {error && <p className="mb-4 text-[10px] text-red-300">{error}</p>}
      <Tabs defaultValue="sessions">
        <TabsList className="mb-4 bg-white/[.035]">
          <TabsTrigger value="sessions">
            <Bot />
            Sessions
          </TabsTrigger>
          <TabsTrigger value="processes">Process & locks</TabsTrigger>
          <TabsTrigger value="questions"><MessageCircleQuestion /> Questions</TabsTrigger>
          <TabsTrigger value="locks">Tous les locks</TabsTrigger>
        </TabsList>
        <TabsContent value="sessions">
          {runtimeIssueCount > 0 && (
            <div className="mb-3 rounded-xl border border-amber-400/15 bg-amber-400/[.045] p-3">
              <div className="flex items-center gap-2 text-[10px] text-amber-200">
                <TriangleAlert className="size-4" />
                <strong>Le runtime signale une ou plusieurs anomalies</strong>
              </div>
              <ul className="mt-2 grid gap-1 text-[9px] text-amber-100/80">
                {!!runtimeHealth?.machines.stale && (
                  <li>
                    {runtimeHealth.machines.stale} machine
                    {runtimeHealth.machines.stale > 1 ? "s" : ""} indiquée
                    {runtimeHealth.machines.stale > 1 ? "s" : ""} en ligne
                    mais sans heartbeat récent — probablement déconnectée
                    {runtimeHealth.machines.stale > 1 ? "s" : ""}.
                  </li>
                )}
                {!!runtimeHealth?.sessions.stale && (
                  <li>
                    {runtimeHealth.sessions.stale} session
                    {runtimeHealth.sessions.stale > 1 ? "s" : ""} active
                    {runtimeHealth.sessions.stale > 1 ? "s" : ""} sans
                    heartbeat récent.
                  </li>
                )}
                {!!runtimeHealth?.commands.stuck && (
                  <li>
                    {runtimeHealth.commands.stuck} commande
                    {runtimeHealth.commands.stuck > 1 ? "s" : ""} runtime
                    bloquée
                    {runtimeHealth.commands.stuck > 1 ? "s" : ""} sans
                    réponse de la machine cible.
                  </li>
                )}
              </ul>
            </div>
          )}
          {questions.some((question) => question.status === "OPEN") && (
            <div className="mb-3 rounded-xl border border-amber-400/15 bg-amber-400/[.045] p-3">
              <div className="flex items-center gap-2 text-[10px] text-amber-200">
                <MessageCircleQuestion className="size-4" />
                <strong>
                  {questions.filter((question) => question.status === "OPEN").length} question(s) de collaborateur en attente du manager
                </strong>
              </div>
              <div className="mt-2 grid gap-1.5">
                {questions
                  .filter((question) => question.status === "OPEN")
                  .slice(0, 3)
                  .map((question) => {
                    const asker = agents.find((agent) => agent.id === question.askerAgentId);
                    return (
                      <div key={question.id} className="rounded-lg border border-white/[.06] bg-black/15 px-3 py-2 text-[9px]">
                        <span className="text-muted-foreground">{asker?.displayName ?? question.askerAgentId} · </span>
                        {question.question}
                        {question.blocking && <Badge className="ml-2" variant="outline">Bloquante</Badge>}
                      </div>
                    );
                  })}
              </div>
              <p className="mt-2 text-[8px] text-muted-foreground">
                Ces questions sont routées au manager ; l’utilisateur n’a pas à répondre directement aux contributeurs.
              </p>
            </div>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-white/[.055] bg-white/[.018] p-1.5">
            <span className="mr-1 hidden items-center gap-1.5 px-2 text-[8px] uppercase tracking-[.12em] text-muted-foreground sm:flex">
              <ListFilter className="size-3" /> Filtrer
            </span>
            <Button
              size="sm"
              variant={sessionFilter === "working" ? "secondary" : "ghost"}
              onClick={() => changeSessionFilter("working")}
            >
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Au travail
              <Badge variant="outline">{activeSessionCount}</Badge>
            </Button>
            <Button
              size="sm"
              variant={sessionFilter === "idle" ? "secondary" : "ghost"}
              onClick={() => changeSessionFilter("idle")}
            >
              <Clock /> En veille
              <Badge variant="outline">{idleSessionCount}</Badge>
            </Button>
            <Button
              size="sm"
              variant={sessionFilter === "history" ? "secondary" : "ghost"}
              onClick={() => changeSessionFilter("history")}
            >
              <History /> Passées
              <Badge variant="outline">{historicalSessionCount}</Badge>
            </Button>
            <Button
              size="sm"
              variant={sessionFilter === "all" ? "secondary" : "ghost"}
              onClick={() => changeSessionFilter("all")}
            >
              Toutes
              <Badge variant="outline">{sessions.length}</Badge>
            </Button>
          </div>
          <div
            className={
              selectedSessionId
                ? "grid items-start gap-3 xl:grid-cols-[minmax(0,.9fr)_minmax(28rem,1.1fr)]"
                : "grid gap-2"
            }
          >
            <div className={`grid min-w-0 content-start gap-2 ${selectedSessionId ? "xl:max-h-[calc(100vh-10rem)] xl:overflow-y-auto xl:overscroll-contain xl:pr-1" : ""}`}>
            {filteredSessions.map((session) => {
              const agent = agents.find((a) => a.id === session.agentId);
              const task = tasks.find((t) => t.id === session.currentTaskId);
              // A session started under a provider the agent has since been
              // switched away from can never be resumed — its providerSessionId
              // belongs to a different CLI. Offer a fresh start instead.
              const canResumeNative =
                Boolean(session.providerSessionId) &&
                session.provider === agent?.provider;
              return (
                <Card
                  key={session.id}
                  className={`overflow-hidden bg-white/[.018] transition-all hover:border-white/[.12] hover:bg-white/[.025] ${selectedSessionId === session.id ? "border-[#f47b64]/35 bg-[#f47b64]/[.025] shadow-[inset_2px_0_0_#f47b64]" : "border-white/[.075]"}`}
                >
                  <CardContent className="p-3.5 sm:p-4">
                    <div
                      className={
                        selectedSessionId
                          ? "grid gap-3"
                          : "grid items-center gap-3 lg:grid-cols-[minmax(12rem,1.2fr)_minmax(18rem,1fr)_auto]"
                      }
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[.06] bg-white/[.035]">
                          <Bot className="size-4 text-[#f47b64]" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="truncate text-xs font-medium">
                          {agent?.displayName ?? session.agentId}
                          </h2>
                          <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
                            {session.provider} · {task?.title ?? "Sans tâche"}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-[8px] text-muted-foreground ${selectedSessionId ? "border-y border-white/[.055] py-2.5" : ""}`}
                      >
                        <Badge variant="outline" className="shrink-0">
                          {session.status}
                        </Badge>
                        <span className="flex items-center gap-1.5">
                          <Clock className="size-3" />
                          Créée · {new Date(session.createdAt).toLocaleString("fr-FR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Activity className="size-3" />
                          Activité · {new Date(session.updatedAt).toLocaleString("fr-FR", {
                            dateStyle: "short",
                            timeStyle: "medium",
                          })}
                        </span>
                        <span>
                          Approbation · <strong className="text-foreground/80">{session.approvalState}</strong>
                        </span>
                        <span
                          className="min-w-0 truncate font-mono"
                          title={session.machineId}
                        >
                          Machine · {session.machineId.slice(0, 8)}
                        </span>
                      </div>
                      <div
                        className={`flex flex-wrap items-center gap-1.5 ${selectedSessionId ? "justify-start" : "justify-end"}`}
                      >
                        <Button
                          size="sm"
                          variant={selectedSessionId === session.id ? "secondary" : "outline"}
                          onClick={() => setSelectedSessionId(session.id)}
                        >
                          <Terminal /> Console
                        </Button>
                      {!session.endedAt && (
                        <LoadingButton
                          loading={
                            pendingAction === `session:${session.id}:heartbeat`
                          }
                          onClick={() =>
                            void sessionAction(session.id, "heartbeat")
                          }
                          size="icon-sm"
                          variant="ghost"
                          title="Envoyer un heartbeat"
                        >
                          <Activity />
                        </LoadingButton>
                      )}
                      {session.endedAt && (
                        <LoadingButton
                          loading={pendingAction === "session:start"}
                          onClick={async () => {
                            try {
                              const resumed = await startSession({
                                agentId: session.agentId,
                                machineId: session.machineId,
                                taskId: session.currentTaskId ?? undefined,
                                instruction:
                                  "Reprends le contexte précédent, vérifie l’état actuel du workspace et poursuis la prochaine action utile.",
                                ...(canResumeNative
                                  ? { resumeFromSessionId: session.id }
                                  : {}),
                              });
                              setSelectedSessionId(resumed.id);
                            } catch {
                              // L’erreur du store reste visible au-dessus de la liste.
                            }
                          }}
                          size="sm"
                          className="bg-[#f47b64] text-[#241614]"
                        >
                          <RotateCcw />
                          {canResumeNative ? "Reprendre" : "Relancer"}
                        </LoadingButton>
                      )}
                      {!session.endedAt && (
                        <select
                          disabled={pendingAction !== null}
                          value={session.status}
                          onChange={(event) =>
                            void sessionAction(
                              session.id,
                              "report",
                              event.target.value,
                            )
                          }
                          className="h-8 max-w-28 rounded-lg border border-white/10 bg-[#191715] px-2 text-[9px]"
                        >
                          <option value="STARTING">Démarrage</option>
                          <option value="RUNNING">Active</option>
                          <option value="IDLE">En veille</option>
                          <option value="AWAITING_APPROVAL">Approbation</option>
                          <option value="COMPLETED">Terminée</option>
                          <option value="FAILED">Échec</option>
                          <option value="CRASHED">Crash</option>
                          <option value="STOPPED">Arrêtée</option>
                        </select>
                      )}
                      {session.approvalState === "PENDING" && (
                        <>
                          <LoadingButton
                            loading={
                              pendingAction === `session:${session.id}:deny`
                            }
                            onClick={() =>
                              void sessionAction(session.id, "deny")
                            }
                            size="sm"
                            variant="destructive"
                          >
                            <X />
                            Refuser
                          </LoadingButton>
                          <LoadingButton
                            loading={
                              pendingAction === `session:${session.id}:approve`
                            }
                            onClick={() =>
                              void sessionAction(session.id, "approve")
                            }
                            size="sm"
                            className="bg-emerald-500 text-[#07130c]"
                          >
                            <Check />
                            Approuver
                          </LoadingButton>
                        </>
                      )}{" "}
                      {!session.endedAt && (
                        <LoadingButton
                          loading={
                            pendingAction === `session:${session.id}:stop`
                          }
                          onClick={() => void sessionAction(session.id, "stop")}
                          size="sm"
                          variant="outline"
                          title="Arrêter la session"
                        >
                          <Square />
                          Arrêter
                        </LoadingButton>
                      )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {!filteredSessions.length && (
              <Card className="border-dashed">
                <CardContent className="grid min-h-48 place-items-center text-[10px] text-muted-foreground">
                  {sessionFilter === "working"
                    ? "Aucun agent au travail."
                    : sessionFilter === "idle"
                      ? "Aucune conversation en veille."
                    : sessionFilter === "history"
                      ? "Aucune session passée."
                      : "Aucune session dans ce workspace."}
                </CardContent>
              </Card>
            )}
            </div>
            {selectedSessionId && (() => {
              const session = sessions.find((item) => item.id === selectedSessionId);
              if (!session) return null;
              const agent = agents.find((item) => item.id === session.agentId);
              // Same constraint as canResumeNative above: an IDLE session's
              // native conversation belongs to whatever provider was active
              // when it started. If the agent's provider has since changed,
              // there is nothing left to reply to — only a fresh session can
              // move this agent forward.
              const canResumeIdle =
                Boolean(session.providerSessionId) &&
                session.provider === agent?.provider;
              const isIdleManagerTurn =
                session.status === "IDLE" &&
                agent?.promptProfile["role"] === "manager";
              return (
                <SessionConsole
                  workspaceId={workspaceId}
                  sessionId={session.id}
                  agentName={agent?.displayName ?? session.agentId}
                  status={session.status}
                  turns={selectedTurns}
                  canReply={isIdleManagerTurn && canResumeIdle}
                  disabledHint={
                    isIdleManagerTurn && !canResumeIdle
                      ? "Le provider de cet agent a changé depuis cette conversation — relancez une nouvelle session pour continuer."
                      : undefined
                  }
                  sending={pendingAction === "session:start"}
                  onSend={async (instruction) => {
                    const next = await startSession({
                      agentId: session.agentId,
                      machineId: session.machineId,
                      taskId: session.currentTaskId ?? undefined,
                      instruction,
                      ...(canResumeIdle
                        ? { resumeFromSessionId: session.id }
                        : {}),
                    });
                    setSessionFilter("working");
                    setSelectedSessionId(next.id);
                  }}
                  onClose={() => setSelectedSessionId(null)}
                />
              );
            })()}
          </div>
        </TabsContent>
        <TabsContent value="processes">
          <ProcessesView workspaceId={workspaceId} />
        </TabsContent>
        <TabsContent value="questions">
          <QuestionsPanel />
        </TabsContent>
        <TabsContent value="locks">
          <LocksPanel />
        </TabsContent>
      </Tabs>
    </>
  );
}
