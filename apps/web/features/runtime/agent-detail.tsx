"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Braces,
  Check,
  Copy,
  Clock3,
  HeartPulse,
  KeyRound,
  Pencil,
  Power,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { PageHeader } from "@/components/shared/page-header";
import { domainApi } from "@/lib/api/domains";
import {
  workspaceColor,
  workspaceInitials,
} from "@/lib/workspace-presentation";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";
import { useAuthStore } from "@/stores/auth-store";

const parseList = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];
const sameList = (left: string[], right: string[]) =>
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

export function AgentDetail({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}) {
  const {
    agents,
    providers,
    sessions,
    loading,
    pendingAction,
    error,
    load,
    updateAgent,
    updateAgentHealth,
  } = useWorkspaceDomainStore();
  const agent = agents.find((item) => item.id === agentId);
  const authToken = useAuthStore((state) => state.token);
  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [permissions, setPermissions] = useState("");
  const [promptProfile, setPromptProfile] = useState("{}");
  const [credentialAction, setCredentialAction] = useState<
    "rotate" | "revoke" | null
  >(null);
  const [credentialPending, setCredentialPending] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedAgentId, setCopiedAgentId] = useState(false);
  useEffect(() => {
    void load(workspaceId);
  }, [load, workspaceId]);
  useEffect(() => {
    if (!agent || editing) return;
    setProvider(agent.provider);
    setDisplayName(agent.displayName);
    setCapabilities(agent.capabilities.join(", "));
    setPermissions(agent.permissions.join(", "));
    setPromptProfile(JSON.stringify(agent.promptProfile, null, 2));
  }, [agent, editing]);

  let parsedPrompt: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(promptProfile);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed))
      parsedPrompt = parsed as Record<string, unknown>;
  } catch {
    /* Validation affichée. */
  }
  const nextCapabilities = parseList(capabilities);
  const nextPermissions = parseList(permissions);
  const dirty =
    !!agent &&
    (provider !== agent.provider ||
      displayName.trim() !== agent.displayName ||
      !sameList(nextCapabilities, agent.capabilities) ||
      !sameList(nextPermissions, agent.permissions) ||
      (parsedPrompt !== null &&
        JSON.stringify(parsedPrompt) !== JSON.stringify(agent.promptProfile)));

  function cancel() {
    if (!agent) return;
    setProvider(agent.provider);
    setDisplayName(agent.displayName);
    setCapabilities(agent.capabilities.join(", "));
    setPermissions(agent.permissions.join(", "));
    setPromptProfile(JSON.stringify(agent.promptProfile, null, 2));
    setEditing(false);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agent || !provider || !displayName.trim() || !parsedPrompt || !dirty)
      return;
    try {
      await updateAgent(agentId, {
        provider,
        displayName: displayName.trim(),
        capabilities: nextCapabilities,
        permissions: nextPermissions,
        promptProfile: parsedPrompt,
      });
      setEditing(false);
    } catch {
      /* Erreur affichée. */
    }
  }

  async function manageCredential() {
    if (!authToken || !credentialAction) return;
    setCredentialPending(true);
    try {
      if (credentialAction === "rotate") {
        const result = await domainApi.rotateAgentToken(
          workspaceId,
          agentId,
          authToken,
        );
        setRevealedToken(result.token);
      } else {
        await domainApi.revokeAgentToken(workspaceId, agentId, authToken);
        setRevealedToken(null);
      }
      setCredentialAction(null);
    } finally {
      setCredentialPending(false);
    }
  }

  async function copyToken() {
    if (!revealedToken) return;
    await navigator.clipboard.writeText(revealedToken);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function copyAgentId() {
    await navigator.clipboard.writeText(agentId);
    setCopiedAgentId(true);
    window.setTimeout(() => setCopiedAgentId(false), 1500);
  }

  if (loading)
    return (
      <div className="grid min-h-64 place-items-center text-xs text-muted-foreground">
        Chargement de l’agent…
      </div>
    );
  if (!agent)
    return (
      <Card>
        <CardContent className="p-6 text-xs">
          {error || "Agent introuvable"}
        </CardContent>
      </Card>
    );
  const color = workspaceColor(agent.id);
  const agentSessions = sessions.filter(
    (session) => session.agentId === agent.id,
  );
  const profileRole =
    typeof agent.promptProfile["role"] === "string"
      ? agent.promptProfile["role"]
      : null;
  const profileMission =
    typeof agent.promptProfile["mission"] === "string"
      ? agent.promptProfile["mission"]
      : null;
  const profileSystemPrompt =
    typeof agent.promptProfile["systemPrompt"] === "string"
      ? agent.promptProfile["systemPrompt"]
      : null;
  const profilePrinciples = Array.isArray(
    agent.promptProfile["operatingPrinciples"],
  )
    ? agent.promptProfile["operatingPrinciples"].filter(
        (item): item is string => typeof item === "string",
      )
    : [];

  return (
    <>
      <Button
        nativeButton={false}
        render={<Link href={`/workspaces/${workspaceId}/agents`} />}
        variant="ghost"
        size="sm"
        className="mb-5 text-muted-foreground"
      >
        <ArrowLeft />
        Agents
      </Button>
      <PageHeader
        eyebrow={`${agent.provider} · ${agent.status}`}
        title={agent.displayName}
        description="Identité, responsabilités, configuration et historique d’exécution."
        actions={
          <LoadingButton
            loading={pendingAction === `agent:${agent.id}:health`}
            onClick={() =>
              void updateAgentHealth(
                agent.id,
                agent.healthState === "HEALTHY" ? "DEGRADED" : "HEALTHY",
              )
            }
            variant="outline"
          >
            <Power />
            {agent.healthState === "HEALTHY"
              ? "Signaler dégradé"
              : "Rétablir la santé"}
          </LoadingButton>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[.78fr_1.22fr]">
        <div className="grid content-start gap-4">
          <Card className="overflow-hidden border-white/[.075] bg-white/[.018]">
            <div
              className="h-20 border-b border-white/[.055]"
              style={{
                background: `radial-gradient(circle at 20% 0%, ${color}25, transparent 60%)`,
              }}
            />
            <CardContent className="relative p-6 pt-0">
              <Avatar className="-mt-8 size-16 border-4 border-[#141311]">
                <AvatarFallback
                  style={{ backgroundColor: `${color}20`, color }}
                  className="text-base font-semibold"
                >
                  {workspaceInitials(agent.displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="mt-4">
                <h2 className="text-base font-medium">{agent.displayName}</h2>
                <p className="mt-1 text-[9px] text-muted-foreground">
                  Agent {agent.provider}
                </p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-white/[.055] p-3">
                  <span className="text-[8px] text-muted-foreground">
                    Présence
                  </span>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={
                        agent.status === "ONLINE"
                          ? "size-1.5 rounded-full bg-emerald-400"
                          : "size-1.5 rounded-full bg-[#625e5a]"
                      }
                    />
                    <strong className="text-[9px]">{agent.status}</strong>
                  </div>
                </div>
                <div className="rounded-lg border border-white/[.055] p-3">
                  <span className="text-[8px] text-muted-foreground">
                    Santé
                  </span>
                  <div className="mt-1 flex items-center gap-2">
                    <HeartPulse className="size-3 text-muted-foreground" />
                    <strong className="text-[9px]">{agent.healthState}</strong>
                  </div>
                </div>
              </div>
              <dl className="mt-5 grid gap-3 border-t border-white/[.055] pt-4 text-[9px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Identifiant</dt>
                  <dd className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="max-w-40 truncate font-mono"
                      title={agent.id}
                    >
                      {agent.id}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => void copyAgentId()}
                      aria-label="Copier l’identifiant de l’agent"
                      title="Copier l’identifiant"
                    >
                      {copiedAgentId ? <Check /> : <Copy />}
                    </Button>
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Dernière activité</dt>
                  <dd>
                    {agent.lastSeenAt
                      ? new Date(agent.lastSeenAt).toLocaleString("fr-FR")
                      : "Jamais"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Tâche actuelle</dt>
                  <dd className="max-w-48 truncate">
                    {agent.currentTaskId || "Aucune"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="border-white/[.075] bg-white/[.018]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bot className="size-4 text-[#f47b64]" />
                <h2 className="text-sm">Sessions</h2>
                <Badge variant="outline" className="ml-auto">
                  {agentSessions.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2">
              {agentSessions.map((session) => (
                <div
                  key={session.id}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-white/[.05] p-3"
                >
                  <Clock3 className="size-3.5 text-muted-foreground" />
                  <div>
                    <strong className="block text-[9px]">
                      {session.status}
                    </strong>
                    <span className="text-[8px] text-muted-foreground">
                      {new Date(session.startedAt).toLocaleString("fr-FR")}
                    </span>
                  </div>
                  <Badge variant="outline">{session.approvalState}</Badge>
                </div>
              ))}
              {!agentSessions.length && (
                <p className="py-5 text-center text-[10px] text-muted-foreground">
                  Aucune session enregistrée.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/[.075] bg-white/[.018]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-[#f47b64]" />
                <h2 className="text-sm">Accès API de l’agent</h2>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-[9px] leading-5 text-muted-foreground">
                Ce secret permet au processus Codex ou Claude d’agir au nom de
                cet agent. Une rotation invalide immédiatement l’ancien token.
              </p>
              <div className="rounded-lg border border-white/[.055] bg-black/10 p-3">
                <p className="text-[8px] uppercase tracking-[.12em] text-muted-foreground">
                  Provisionnement sur la machine
                </p>
                <code className="mt-2 block break-all text-[9px] text-foreground">
                  npm run agent-token:set -w apps/runtime -- {agent.id}
                </code>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCredentialAction("rotate")}
                >
                  <KeyRound /> Régénérer le token
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setCredentialAction("revoke")}
                >
                  Révoquer
                </Button>
              </div>
              {revealedToken && (
                <div className="animate-in fade-in slide-in-from-top-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[.055] p-4">
                  <p className="text-[9px] font-medium text-emerald-300">
                    Copiez maintenant ce token : il ne sera plus affiché.
                  </p>
                  <code className="mt-3 block break-all rounded-md bg-black/20 p-3 text-[8px] leading-4">
                    {revealedToken}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => void copyToken()}
                  >
                    {copied ? <Check /> : <Copy />}
                    {copied ? "Copié" : "Copier le token"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit border-white/[.075] bg-white/[.018]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2
                  className={
                    editing ? "text-sm" : "text-sm text-muted-foreground"
                  }
                >
                  Configuration de l’agent
                </h2>
                <p className="mt-1 text-[9px] text-muted-foreground">
                  Identité déclarée, capacités, permissions et profil de prompt.
                </p>
              </div>
              {!editing && (
                <Button
                  onClick={() => setEditing(true)}
                  size="sm"
                  variant="outline"
                >
                  <Pencil />
                  Modifier
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editing ? (
              <form onSubmit={submit} className="grid gap-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-xs">
                    Nom affiché
                    <Input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      autoFocus
                      required
                    />
                  </label>
                  <label className="grid gap-2 text-xs">
                    Provider
                    <select
                      value={provider}
                      onChange={(event) => setProvider(event.target.value)}
                      required
                      className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3"
                    >
                      {!providers.some((item) => item.provider === provider) &&
                        provider && <option value={provider}>{provider}</option>}
                      {providers.map((item) => (
                        <option key={item.id} value={item.provider}>
                          {item.provider}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="grid gap-2 text-xs">
                  Capacités
                  <Input
                    value={capabilities}
                    onChange={(event) => setCapabilities(event.target.value)}
                    placeholder="code_edit, shell_exec, run_tests"
                  />
                  <span className="text-[8px] text-muted-foreground">
                    Séparées par des virgules. Les doublons sont supprimés.
                  </span>
                </label>
                <label className="grid gap-2 text-xs">
                  Permissions supplémentaires
                  <Input
                    value={permissions}
                    onChange={(event) => setPermissions(event.target.value)}
                    placeholder="read_files, write_files"
                  />
                </label>
                <label className="grid gap-2 text-xs">
                  Profil de prompt
                  <textarea
                    value={promptProfile}
                    onChange={(event) => setPromptProfile(event.target.value)}
                    spellCheck={false}
                    className="min-h-52 resize-y rounded-lg border border-white/10 bg-black/15 p-4 font-mono text-[9px] leading-5 outline-none focus:border-[#f47b64]/40"
                  />
                  {parsedPrompt === null && (
                    <span className="text-[9px] text-red-300">
                      Le profil doit être un objet JSON valide.
                    </span>
                  )}
                </label>
                <div className="flex justify-end gap-2">
                  <Button type="button" onClick={cancel} variant="ghost">
                    <X />
                    Annuler
                  </Button>
                  <LoadingButton
                    type="submit"
                    loading={pendingAction === `agent:${agent.id}:update`}
                    disabled={
                      !dirty ||
                      !provider ||
                      !displayName.trim() ||
                      parsedPrompt === null
                    }
                    className="bg-[#f47b64] text-[#241614]"
                  >
                    <Save />
                    Enregistrer les modifications
                  </LoadingButton>
                </div>
              </form>
            ) : (
              <div className="grid gap-6">
                <section>
                  <div className="mb-3 flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[.14em] text-[#625e5a]">
                    <Sparkles className="size-3" />
                    Capacités
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {agent.capabilities.map((capability) => (
                      <Badge key={capability} variant="outline">
                        {capability.replaceAll("_", " ")}
                      </Badge>
                    ))}
                    {!agent.capabilities.length && (
                      <p className="text-[10px] italic text-muted-foreground">
                        Aucune capacité déclarée.
                      </p>
                    )}
                  </div>
                </section>
                <section className="border-t border-white/[.055] pt-5">
                  <div className="mb-3 flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[.14em] text-[#625e5a]">
                    <KeyRound className="size-3" />
                    Permissions supplémentaires
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {agent.permissions.map((permission) => (
                      <Badge key={permission} variant="outline">
                        {permission.replaceAll("_", " ")}
                      </Badge>
                    ))}
                    {!agent.permissions.length && (
                      <p className="text-[10px] italic text-muted-foreground">
                        Aucune permission supplémentaire.
                      </p>
                    )}
                  </div>
                </section>
                <section className="border-t border-white/[.055] pt-5">
                  <div className="mb-3 flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[.14em] text-[#625e5a]">
                    <Braces className="size-3" />
                    Profil de prompt
                    {profileRole && (
                      <Badge
                        variant="outline"
                        className="ml-auto normal-case tracking-normal"
                      >
                        {profileRole}
                      </Badge>
                    )}
                  </div>
                  {profileMission && (
                    <p className="mb-3 rounded-lg border border-[#f47b64]/10 bg-[#f47b64]/[.035] p-3 text-[10px] leading-5 text-[#c5c0bb]">
                      {profileMission}
                    </p>
                  )}
                  {profileSystemPrompt ? (
                    <div className="rounded-xl border border-white/[.055] bg-black/15 p-4">
                      <p className="mb-2 text-[8px] font-semibold uppercase tracking-[.12em] text-[#625e5a]">
                        Instructions système
                      </p>
                      <p className="whitespace-pre-line text-[9px] leading-5 text-[#aaa5a0]">
                        {profileSystemPrompt}
                      </p>
                    </div>
                  ) : (
                    <pre className="max-h-80 overflow-auto rounded-xl border border-white/[.055] bg-black/15 p-4 font-mono text-[9px] leading-5 text-[#aaa5a0]">
                      <code>
                        {JSON.stringify(agent.promptProfile, null, 2)}
                      </code>
                    </pre>
                  )}
                  {!!profilePrinciples.length && (
                    <div className="mt-3">
                      <p className="mb-2 text-[8px] font-semibold uppercase tracking-[.12em] text-[#625e5a]">
                        Principes opérationnels
                      </p>
                      <ul className="grid gap-1.5">
                        {profilePrinciples.map((principle) => (
                          <li
                            key={principle}
                            className="flex gap-2 text-[9px] leading-4 text-muted-foreground"
                          >
                            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[#f47b64]" />
                            {principle}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {error && <p className="mt-4 text-[10px] text-red-300">{error}</p>}
      <AlertDialog
        open={credentialAction !== null}
        onOpenChange={(open) => !open && setCredentialAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {credentialAction === "rotate"
                ? "Régénérer le token ?"
                : "Révoquer le token ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {credentialAction === "rotate"
                ? "L’ancien token cessera immédiatement de fonctionner. Vous devrez enregistrer le nouveau dans chaque daemon qui exécute cet agent."
                : "L’agent perdra son accès API. Supprimez ensuite sa copie locale avec la commande agent-token:remove."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={credentialPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={credentialPending}
              onClick={() => void manageCredential()}
              variant={credentialAction === "revoke" ? "destructive" : "default"}
            >
              {credentialPending ? "Traitement…" : "Confirmer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
