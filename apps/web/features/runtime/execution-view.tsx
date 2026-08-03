"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Bot,
  Check,
  Clock,
  History,
  ListFilter,
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
import { SessionConsole } from "./session-console";
import { ProcessesView } from "./processes-view";
import { LocksPanel } from "./locks-panel";
export function ExecutionView({ workspaceId }: { workspaceId: string }) {
  const searchParams = useSearchParams();
  const requestedSessionId = searchParams.get("session");
  const [activeTab, setActiveTab] = useState(
    searchParams.get("tab") === "processes" ? "processes" : "sessions",
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState<
    "working" | "idle" | "history" | "all"
  >("working");
  const {
    sessions,
    questions,
    notifications,
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
  const recentSessions = useMemo(
    () =>
      [...new Map(sessions.map((session) => [session.id, session])).values()].sort((left, right) => {
        const leftActivity = Math.max(
          Date.parse(left.updatedAt),
          left.lastHeartbeatAt ? Date.parse(left.lastHeartbeatAt) : 0,
          Date.parse(left.createdAt),
        );
        const rightActivity = Math.max(
          Date.parse(right.updatedAt),
          right.lastHeartbeatAt ? Date.parse(right.lastHeartbeatAt) : 0,
          Date.parse(right.createdAt),
        );
        return (
          rightActivity - leftActivity ||
          Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
          right.id.localeCompare(left.id)
        );
      }),
    [sessions],
  );
  const activeSessionCount = sessions.filter((session) => workingStatuses.includes(session.status)).length;
  const idleSessionCount = sessions.filter((session) => session.status === "IDLE").length;
  const historicalSessionCount = sessions.filter((session) => Boolean(session.endedAt)).length;
  const filteredSessions = recentSessions.filter((session) =>
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
        eyebrow="Collaboration"
        title="Collaboration"
        description="Suivre les conversations, les sessions et les ressources d’exécution partagées par le collectif."
        actions={
          <>
            <LiveIndicator
              label={
                connected ? "Temps réel connecté" : "Temps réel hors ligne"
              }
            />
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
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(String(value))}>
        <TabsList className="mb-4 bg-white/[.035]">
          <TabsTrigger value="sessions"><Bot /> Sessions & conversations</TabsTrigger>
          <TabsTrigger value="processes">Processus & locks</TabsTrigger>
        </TabsList>
        <TabsContent value="sessions">
          {(runtimeIssueCount > 0 || questions.some((question) => question.status === "OPEN")) && (
            <Button
              nativeButton={false}
              render={<Link href={`/workspaces/${workspaceId}/attention`} />}
              variant="ghost"
              className="mb-3 h-auto w-full justify-start gap-2 rounded-xl border border-amber-400/15 bg-amber-400/[.045] p-3 text-left text-[10px] text-amber-200 hover:border-amber-400/25 hover:bg-amber-400/[.065]"
            >
              <TriangleAlert className="size-4 shrink-0" />
              <strong className="flex-1">
                Des interventions attendent votre attention
              </strong>
              <span className="flex items-center gap-1 text-amber-100/80">
                Ouvrir le centre
                <ArrowRight className="size-3" />
              </span>
            </Button>
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
            <div className={selectedSessionId
              ? "app-scrollbar min-w-0 rounded-xl border border-white/[.055] bg-black/10 p-1.5 [&>*+*]:mt-1.5 xl:h-[calc(100dvh-10rem)] xl:overflow-y-auto xl:overscroll-contain"
              : "grid min-w-0 content-start gap-1.5"}>
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
                  <CardContent className={selectedSessionId ? "p-2.5" : "p-3"}>
                    <div
                      className={
                        selectedSessionId
                          ? "grid gap-2"
                          : "grid items-center gap-2.5 lg:grid-cols-[minmax(12rem,1.2fr)_minmax(18rem,1fr)_auto]"
                      }
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className={`grid shrink-0 place-items-center rounded-lg border border-white/[.06] bg-white/[.035] ${selectedSessionId ? "size-7" : "size-8"}`}>
                          <Bot className={selectedSessionId ? "size-3.5 text-[#f47b64]" : "size-4 text-[#f47b64]"} />
                        </div>
                        <div className="min-w-0">
                          <h2 className="truncate text-[11px] font-medium">
                          {agent?.displayName ?? session.agentId}
                          </h2>
                          <p className="truncate text-[8px] text-muted-foreground">
                            {session.provider} · {task?.title ?? "Sans tâche"}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[8px] text-muted-foreground ${selectedSessionId ? "border-y border-white/[.055] py-1.5" : ""}`}
                      >
                        <Badge variant="outline" className="shrink-0">
                          {session.status}
                        </Badge>
                        <span className="flex items-center gap-1.5">
                          <Clock className="size-3" />
                          {selectedSessionId ? "Créée" : "Créée ·"} {new Date(session.createdAt).toLocaleString("fr-FR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Activity className="size-3" />
                          {selectedSessionId ? "Activité" : "Activité ·"} {new Date(session.updatedAt).toLocaleString("fr-FR", {
                            dateStyle: "short",
                            timeStyle: "medium",
                          })}
                        </span>
                        <span>
                          {selectedSessionId ? "Approb." : "Approbation ·"} <strong className="text-foreground/80">{session.approvalState}</strong>
                        </span>
                        <span
                          className="min-w-0 truncate font-mono"
                          title={session.machineId}
                        >
                          {selectedSessionId ? "Machine" : "Machine ·"} {session.machineId.slice(0, 8)}
                        </span>
                      </div>
                      <div
                        className={`flex flex-wrap items-center gap-1 ${selectedSessionId ? "justify-start" : "justify-end"}`}
                      >
                        <Button
                          size={selectedSessionId ? "xs" : "sm"}
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
                          size={selectedSessionId ? "xs" : "sm"}
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
                          className="h-7 max-w-25 rounded-md border border-white/10 bg-[#191715] px-1.5 text-[8px]"
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
                            size={selectedSessionId ? "xs" : "sm"}
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
                            size={selectedSessionId ? "xs" : "sm"}
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
                          size={selectedSessionId ? "icon-sm" : "sm"}
                          variant="outline"
                          title="Arrêter la session"
                        >
                          <Square />
                          {!selectedSessionId && "Arrêter"}
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
                ["IDLE", "FAILED", "CRASHED"].includes(session.status) &&
                agent?.promptProfile["role"] === "manager";
              const isManagerConversation =
                agent?.promptProfile["role"] === "manager";
              const latestAgentSession = recentSessions.find(
                (item) => item.agentId === session.agentId,
              );
              return (
                <SessionConsole
                  workspaceId={workspaceId}
                  sessionId={session.id}
                  agentName={agent?.displayName ?? session.agentId}
                  status={session.status}
                  turns={selectedTurns}
                  questions={questions}
                  notifications={notifications}
                  agentNames={Object.fromEntries(
                    agents.map((item) => [item.id, item.displayName]),
                  )}
                  isLatestAgentConversation={latestAgentSession?.id === session.id}
                  showComposer={isManagerConversation}
                  canReply={isIdleManagerTurn}
                  disabledHint={
                    isIdleManagerTurn && !canResumeIdle
                      ? "La conversation native n’est plus récupérable. Le prochain message ouvrira automatiquement un nouveau fil lié à cet historique."
                      : undefined
                  }
                  sending={pendingAction === "session:start"}
                  onSend={async (instruction) => {
                    const baseInput = {
                      agentId: session.agentId,
                      machineId: session.machineId,
                      taskId: session.currentTaskId ?? undefined,
                      instruction,
                    };
                    let next;
                    try {
                      next = await startSession({
                        ...baseInput,
                        ...(canResumeIdle
                          ? { resumeFromSessionId: session.id }
                          : { lineageFromSessionId: session.id }),
                      });
                    } catch (error) {
                      if (
                        !canResumeIdle ||
                        !(error instanceof Error) ||
                        !/no recoverable provider conversation|not resumable/i.test(
                          error.message,
                        )
                      )
                        throw error;
                      next = await startSession({
                        ...baseInput,
                        lineageFromSessionId: session.id,
                      });
                    }
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
          <div className="grid gap-4">
            <ProcessesView workspaceId={workspaceId} embedded />
            <LocksPanel />
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
