"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  ArrowRight,
  Bot,
  Clock3,
  HeartPulse,
  Power,
  RefreshCw,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { PageHeader } from "@/components/shared/page-header";
import { StatusDot } from "@/components/shared/status-dot";
import { RegisterAgentDialog } from "@/features/workspaces/register-agent-dialog";
import {
  workspaceColor,
  workspaceInitials,
} from "@/lib/workspace-presentation";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";

export function AgentsView({ workspaceId }: { workspaceId: string }) {
  const {
    agents,
    loading,
    error,
    pendingAction,
    load,
    backfillAgentPromptProfiles,
  } = useWorkspaceDomainStore();
  useEffect(() => {
    void load(workspaceId);
  }, [load, workspaceId]);

  async function offline(id: string) {
    const { domainApi } = await import("@/lib/api/domains");
    const token = (await import("@/stores/auth-store")).useAuthStore.getState()
      .token;
    if (!token) return;
    useWorkspaceDomainStore.setState({
      pendingAction: `agent:${id}:offline`,
      error: null,
    });
    try {
      const agent = await domainApi.forceAgentOffline(workspaceId, id, token);
      useWorkspaceDomainStore.setState((state) => ({
        agents: state.agents.map((item) => (item.id === id ? agent : item)),
        pendingAction: null,
      }));
    } catch (cause) {
      useWorkspaceDomainStore.setState({
        pendingAction: null,
        error: cause instanceof Error ? cause.message : "Action impossible",
      });
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Équipe IA"
        title="Agents"
        description="Registre réel des agents, responsabilités, présence et santé opérationnelle."
        actions={
          <>
            {agents.some(
              (agent) => Object.keys(agent.promptProfile).length === 0,
            ) && (
              <LoadingButton
                loading={pendingAction === "agent:profiles:backfill"}
                loadingText="Initialisation…"
                onClick={() => void backfillAgentPromptProfiles()}
                variant="outline"
              >
                <WandSparkles />
                Initialiser les profils existants
              </LoadingButton>
            )}
            <LoadingButton
              loading={loading}
              onClick={() => void load(workspaceId, true)}
              size="icon-lg"
              variant="outline"
            >
              <RefreshCw />
            </LoadingButton>
            <RegisterAgentDialog />
          </>
        }
      />
      {error && <p className="mb-4 text-[10px] text-red-300">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => {
          const color = workspaceColor(agent.id);
          const visibleCapabilities = agent.capabilities.slice(0, 3);
          return (
            <Card
              key={agent.id}
              className="group overflow-hidden border-white/[.075] bg-white/[.018] transition-all hover:-translate-y-0.5 hover:border-white/[.12] hover:bg-white/[.025]"
            >
              <CardContent className="p-0">
                <div className="flex items-start gap-3 border-b border-white/[.055] p-5">
                  <Avatar className="size-11 ring-1 ring-white/10">
                    <AvatarFallback
                      style={{ backgroundColor: `${color}18`, color }}
                      className="font-semibold"
                    >
                      {workspaceInitials(agent.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-sm font-medium">
                        {agent.displayName}
                      </h2>
                      <StatusDot
                        status={
                          agent.status === "ONLINE" ? "online" : "offline"
                        }
                      />
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="outline" className="text-[8px]">
                        {agent.provider}
                      </Badge>
                      <span className="text-[8px] text-muted-foreground">
                        {agent.status}
                      </span>
                    </div>
                  </div>
                  {agent.status !== "OFFLINE" && (
                    <LoadingButton
                      loading={pendingAction === `agent:${agent.id}:offline`}
                      onClick={() => void offline(agent.id)}
                      size="icon-xs"
                      variant="ghost"
                      title="Forcer hors ligne"
                    >
                      <Power />
                    </LoadingButton>
                  )}
                </div>
                <div className="grid grid-cols-2 divide-x divide-white/[.055] border-b border-white/[.055]">
                  <div className="flex items-center gap-2 px-4 py-3">
                    <HeartPulse className="size-3.5 text-muted-foreground" />
                    <div>
                      <span className="block text-[8px] text-muted-foreground">
                        Santé
                      </span>
                      <strong className="text-[9px] font-medium">
                        {agent.healthState}
                      </strong>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-3">
                    <Bot className="size-3.5 text-muted-foreground" />
                    <div className="min-w-0">
                      <span className="block text-[8px] text-muted-foreground">
                        Tâche actuelle
                      </span>
                      <strong className="block truncate text-[9px] font-medium">
                        {agent.currentTaskId || "Aucune"}
                      </strong>
                    </div>
                  </div>
                </div>
                <div className="min-h-24 p-4">
                  <div className="mb-2 flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[.12em] text-[#625e5a]">
                    <Sparkles className="size-3" />
                    Capacités
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {visibleCapabilities.map((capability) => (
                      <Badge
                        key={capability}
                        variant="outline"
                        className="text-[8px]"
                      >
                        {capability.replaceAll("_", " ")}
                      </Badge>
                    ))}
                    {agent.capabilities.length > 3 && (
                      <Badge variant="outline" className="text-[8px]">
                        +{agent.capabilities.length - 3}
                      </Badge>
                    )}
                    {!agent.capabilities.length && (
                      <span className="text-[9px] italic text-muted-foreground">
                        Aucune capacité déclarée
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-white/[.055] px-4 py-3">
                  <span className="flex items-center gap-1.5 text-[8px] text-muted-foreground">
                    <Clock3 className="size-3" />
                    {agent.lastSeenAt
                      ? new Date(agent.lastSeenAt).toLocaleString("fr-FR")
                      : "Jamais connecté"}
                  </span>
                  <Button
                    nativeButton={false}
                    render={
                      <Link
                        href={`/workspaces/${workspaceId}/agents/${agent.id}`}
                      />
                    }
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[9px]"
                  >
                    Ouvrir la fiche
                    <ArrowRight />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
