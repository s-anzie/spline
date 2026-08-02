"use client";
import { FormEvent, useEffect, useState } from "react";
import {
  FolderRoot,
  HardDrive,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  Timer,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { LatexContent } from "@/components/shared/latex-content";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
export function IntegratedSettings({ workspaceId }: { workspaceId: string }) {
  const {
    workspaces,
    loading,
    error,
    loadWorkspaces,
    updateWorkspace,
    updateIdentity,
  } = useWorkspaceStore();
  const workspace = workspaces.find((w) => w.id === workspaceId);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingRootPath, setEditingRootPath] = useState(false);
  const [rootPath, setRootPath] = useState("");
  const [editingRuleset, setEditingRuleset] = useState(false);
  const [ruleset, setRuleset] = useState("");
  const {
    machines,
    agents,
    wakeStatus,
    providers,
    pendingAction,
    linkMachine,
    load: loadDomains,
  } = useWorkspaceDomainStore();
  useEffect(() => {
    void loadWorkspaces();
    void loadDomains(workspaceId);
  }, [loadDomains, loadWorkspaces, workspaceId]);
  useEffect(() => {
    if (!workspace || editingIdentity) return;
    setName(workspace.name);
    setDescription(workspace.description ?? "");
  }, [editingIdentity, workspace]);
  useEffect(() => {
    if (!workspace || editingRootPath) return;
    setRootPath(workspace.rootPath ?? "");
  }, [editingRootPath, workspace]);
  useEffect(() => {
    if (!workspace || editingRuleset) return;
    setRuleset(JSON.stringify(workspace.ruleset, null, 2));
  }, [editingRuleset, workspace]);
  async function submitMachine(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const machineId = String(new FormData(form).get("machineId")).trim();
    try {
      await linkMachine(machineId);
      form.reset();
    } catch {
      /* Erreur affichée sous les formulaires. */
    }
  }
  async function submitIdentity(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!workspace) return;
    const nextName = name.trim();
    const nextDescription = description.trim();
    const changed =
      nextName !== workspace.name ||
      nextDescription !== (workspace.description ?? "");
    if (!changed || !nextName) return;
    try {
      await updateIdentity(workspaceId, {
        name: nextName,
        description: nextDescription,
      });
      setEditingIdentity(false);
    } catch {
      /* L’erreur du store reste affichée. */
    }
  }
  function cancelIdentity() {
    if (!workspace) return;
    setName(workspace.name);
    setDescription(workspace.description ?? "");
    setEditingIdentity(false);
  }
  async function submitRootPath(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      !workspace ||
      !rootPath.trim() ||
      rootPath.trim() === (workspace.rootPath ?? "")
    )
      return;
    try {
      await updateWorkspace(workspaceId, "rootPath", rootPath.trim());
      setEditingRootPath(false);
    } catch {
      /* Erreur du store affichée. */
    }
  }
  function cancelRootPath() {
    setRootPath(workspace?.rootPath ?? "");
    setEditingRootPath(false);
  }
  let parsedRuleset: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(ruleset);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed))
      parsedRuleset = parsed as Record<string, unknown>;
  } catch {
    /* Le message de validation est affiché dans l’éditeur. */
  }
  const rulesetChanged =
    parsedRuleset !== null &&
    JSON.stringify(parsedRuleset) !== JSON.stringify(workspace?.ruleset ?? {});
  async function submitRuleset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!workspace || !parsedRuleset || !rulesetChanged) return;
    try {
      await updateWorkspace(
        workspaceId,
        "ruleset",
        JSON.stringify(parsedRuleset),
      );
      setEditingRuleset(false);
    } catch {
      /* Erreur du store affichée. */
    }
  }
  function cancelRuleset() {
    setRuleset(JSON.stringify(workspace?.ruleset ?? {}, null, 2));
    setEditingRuleset(false);
  }
  async function submitCollaboration(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!workspace) return;
    const data = new FormData(e.currentTarget);
    const current =
      workspace.ruleset.collaboration &&
      typeof workspace.ruleset.collaboration === "object"
        ? (workspace.ruleset.collaboration as Record<string, unknown>)
        : {};
    const nextRuleset = {
      ...workspace.ruleset,
      collaboration: {
        ...current,
        autoWakeEnabled: data.get("autoWakeEnabled") === "on",
        managerWakeIntervalMinutes: Number(data.get("managerInterval")),
        contributorWakeIntervalMinutes: Number(data.get("contributorInterval")),
      },
    };
    await updateWorkspace(workspaceId, "ruleset", JSON.stringify(nextRuleset));
  }
  if (!workspace)
    return (
      <div className="grid min-h-64 place-items-center text-xs text-muted-foreground">
        Chargement de la configuration…
      </div>
    );
  return (
    <>
      <PageHeader
        eyebrow={workspace.name}
        title="Configuration du workspace"
        description="Identité, périmètre local, règles injectées et ressources d’exécution réelles."
      />
      <Tabs defaultValue="general">
        <TabsList className="mb-5 bg-white/[.035]">
          <TabsTrigger value="general">Général</TabsTrigger>
          <TabsTrigger value="runtime">Runtime</TabsTrigger>
          <TabsTrigger value="rules">Ruleset</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <Card className="max-w-3xl border-white/[.075] bg-white/[.018]">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <h2
                    className={
                      editingIdentity
                        ? "text-sm text-foreground"
                        : "text-sm text-muted-foreground"
                    }
                  >
                    Identité du projet
                  </h2>
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    Nom et description Markdown avec formules LaTeX.
                  </p>
                </div>
                {!editingIdentity && (
                  <Button
                    onClick={() => setEditingIdentity(true)}
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
              {editingIdentity ? (
                <form onSubmit={submitIdentity} className="grid gap-4">
                  <label className="grid gap-2 text-xs">
                    Nom
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoFocus
                      required
                    />
                  </label>
                  <label className="grid gap-2 text-xs">
                    Description
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder={
                        "Décrivez le projet en Markdown. Formule en ligne : $E = mc^2$\n\nFormule en bloc : $$\\int_0^1 x^2 dx$$"
                      }
                      className="min-h-56 resize-y rounded-lg border border-white/10 bg-black/15 p-3 font-mono text-[11px] leading-5 outline-none transition-colors focus:border-[#f47b64]/40"
                    />
                    <span className="text-[8px] text-muted-foreground">
                      Markdown, tableaux, code et LaTeX `$…$` ou `$$…$$` pris en
                      charge.
                    </span>
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      onClick={cancelIdentity}
                      variant="ghost"
                    >
                      <X />
                      Annuler
                    </Button>
                    <LoadingButton
                      type="submit"
                      loading={loading}
                      disabled={
                        !name.trim() ||
                        (name.trim() === workspace.name &&
                          description.trim() === (workspace.description ?? ""))
                      }
                      className="bg-[#f47b64] text-[#241614]"
                    >
                      <Save />
                      Enregistrer les modifications
                    </LoadingButton>
                  </div>
                </form>
              ) : (
                <div className="grid gap-4">
                  <div>
                    <p className="text-[8px] font-semibold uppercase tracking-[.14em] text-[#625e5a]">
                      Nom du projet
                    </p>
                    <h3 className="mt-2 text-lg font-medium tracking-tight text-[#aaa5a0]">
                      {workspace.name}
                    </h3>
                  </div>
                  <div className="rounded-xl border border-white/[.06] bg-white/[.012] p-5">
                    <p className="mb-3 text-[8px] font-semibold uppercase tracking-[.14em] text-[#625e5a]">
                      Description
                    </p>
                    {workspace.description ? (
                      <LatexContent className="text-[11px]">
                        {workspace.description}
                      </LatexContent>
                    ) : (
                      <p className="text-[10px] italic text-muted-foreground">
                        Aucune description.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="runtime" className="grid max-w-4xl gap-3">
          <Card className="border-white/[.075] bg-white/[.018]">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FolderRoot className="size-4 text-[#f47b64]" />
                  <div>
                    <h2
                      className={
                        editingRootPath
                          ? "text-sm"
                          : "text-sm text-muted-foreground"
                      }
                    >
                      Racine locale autorisée
                    </h2>
                    <p className="mt-1 text-[9px] text-muted-foreground">
                      Limite le périmètre du système de fichiers accessible au
                      runtime.
                    </p>
                  </div>
                </div>
                {!editingRootPath && (
                  <Button
                    onClick={() => setEditingRootPath(true)}
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
              {editingRootPath ? (
                <form onSubmit={submitRootPath} className="grid gap-3">
                  <Input
                    value={rootPath}
                    onChange={(event) => setRootPath(event.target.value)}
                    required
                    autoFocus
                    placeholder="/home/user/projet"
                    className="font-mono"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      onClick={cancelRootPath}
                      variant="ghost"
                    >
                      <X />
                      Annuler
                    </Button>
                    <LoadingButton
                      type="submit"
                      loading={loading}
                      disabled={
                        !rootPath.trim() ||
                        rootPath.trim() === (workspace.rootPath ?? "")
                      }
                    >
                      <Save />
                      Enregistrer
                    </LoadingButton>
                  </div>
                </form>
              ) : (
                <div className="rounded-lg border border-white/[.055] bg-black/10 px-4 py-3 font-mono text-[11px] text-[#aaa5a0]">
                  {workspace.rootPath || (
                    <span className="font-sans italic text-muted-foreground">
                      Aucune racine configurée
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border-white/[.075] bg-white/[.018]">
            <CardHeader>
              <h2 className="text-sm">Machines liées</h2>
            </CardHeader>
            <CardContent className="grid gap-3">
              <form onSubmit={submitMachine} className="flex gap-2">
                <Input
                  name="machineId"
                  required
                  placeholder="ID d’une machine déjà enregistrée"
                />
                <LoadingButton
                  type="submit"
                  loading={pendingAction?.endsWith(":link") ?? false}
                >
                  Rattacher
                </LoadingButton>
              </form>
              {machines.map((machine) => (
                <div
                  key={machine.id}
                  className="flex items-center gap-3 rounded-lg border border-white/[.06] p-3"
                >
                  <HardDrive className="size-4 text-cyan-300" />
                  <div className="flex-1">
                    <strong className="block text-[10px]">
                      {machine.hostname}
                    </strong>
                    <span className="text-[8px] text-muted-foreground">
                      {machine.os}
                    </span>
                  </div>
                  <Badge variant="outline">{machine.runtimeStatus}</Badge>
                </div>
              ))}
              {!machines.length && (
                <p className="text-[10px] text-muted-foreground">
                  Aucune machine liée.
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="border-white/[.075] bg-white/[.018]">
            <CardHeader>
              <h2 className="text-sm">Profils providers</h2>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {providers.map((profile) => (
                <div
                  key={profile.id}
                  className="rounded-lg border border-white/[.06] p-3"
                >
                  <strong className="text-[10px]">{profile.provider}</strong>
                  <p className="mt-2 line-clamp-2 text-[8px] text-muted-foreground">
                    {JSON.stringify(profile.capabilities)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="rules">
          <Card className="mb-4 max-w-3xl border-[#f47b64]/15 bg-[#f47b64]/[.025]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Timer className="size-4 text-[#f47b64]" />
                <div>
                  <h2 className="text-sm">Rythme de collaboration</h2>
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    Spline réveille les conversations terminées sans maintenir les CLI artificiellement ouvertes.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitCollaboration} className="grid gap-4 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-[10px] sm:col-span-2">
                  <input
                    type="checkbox"
                    name="autoWakeEnabled"
                    defaultChecked={
                      (workspace.ruleset.collaboration as Record<string, unknown> | undefined)?.autoWakeEnabled !== false
                    }
                    className="accent-[#f47b64]"
                  />
                  Réveiller automatiquement les agents déjà engagés
                </label>
                <label className="grid gap-1.5 text-[10px] text-muted-foreground">
                  Manager · minutes
                  <Input
                    type="number"
                    name="managerInterval"
                    min={1}
                    max={1440}
                    defaultValue={Number(
                      (workspace.ruleset.collaboration as Record<string, unknown> | undefined)?.managerWakeIntervalMinutes ?? 2,
                    )}
                  />
                </label>
                <label className="grid gap-1.5 text-[10px] text-muted-foreground">
                  Collaborateurs · minutes
                  <Input
                    type="number"
                    name="contributorInterval"
                    min={1}
                    max={1440}
                    defaultValue={Number(
                      (workspace.ruleset.collaboration as Record<string, unknown> | undefined)?.contributorWakeIntervalMinutes ?? 2,
                    )}
                  />
                </label>
                <div className="flex justify-end sm:col-span-2">
                  <LoadingButton type="submit" loading={loading} variant="outline">
                    <Save /> Enregistrer le rythme
                  </LoadingButton>
                </div>
              </form>
              <div className="mt-4 grid gap-2 border-t border-white/[.06] pt-4 sm:grid-cols-2">
                {agents.map((agent) => {
                  const wake = wakeStatus.find((item) => item.agentId === agent.id);
                  const role = String(agent.promptProfile["role"] ?? "observer");
                  const toolCount =
                    role === "manager" ? 54 : role === "contributor" ? 45 : 43;
                  return (
                    <div key={agent.id} className="rounded-lg border border-white/[.06] bg-black/15 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="truncate text-[10px]">{agent.displayName}</strong>
                        <Badge variant="outline">{toolCount} outils MCP</Badge>
                      </div>
                      <p className="mt-1 text-[8px] uppercase tracking-wider text-muted-foreground">
                        {role} · {agent.provider}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[8px]">
                        <span className="rounded-full bg-white/[.04] px-2 py-1">
                          Scheduler · {wake?.scheduler.status ?? "INCONNU"}
                        </span>
                        <span className="rounded-full bg-white/[.04] px-2 py-1">
                          Cron natif · {wake?.nativeCron.status ?? "INCONNU"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <Card className="max-w-3xl border-white/[.075] bg-white/[.018]">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-[#f47b64]" />
                  <div>
                    <h2
                      className={
                        editingRuleset
                          ? "text-sm"
                          : "text-sm text-muted-foreground"
                      }
                    >
                      Ruleset JSON injecté aux agents
                    </h2>
                    <p className="mt-1 text-[9px] text-muted-foreground">
                      Règles de gouvernance transmises aux agents du workspace.
                    </p>
                  </div>
                </div>
                {!editingRuleset && (
                  <Button
                    onClick={() => setEditingRuleset(true)}
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
              {editingRuleset ? (
                <form onSubmit={submitRuleset} className="grid gap-3">
                  <textarea
                    value={ruleset}
                    onChange={(event) => setRuleset(event.target.value)}
                    autoFocus
                    spellCheck={false}
                    className="min-h-72 resize-y rounded-lg border border-white/10 bg-black/15 p-4 font-mono text-[10px] leading-5 outline-none transition-colors focus:border-[#f47b64]/40"
                  />
                  {parsedRuleset === null && (
                    <p className="text-[9px] text-red-300">
                      Le ruleset doit être un objet JSON valide.
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      onClick={cancelRuleset}
                      variant="ghost"
                    >
                      <X />
                      Annuler
                    </Button>
                    <LoadingButton
                      type="submit"
                      loading={loading}
                      disabled={!rulesetChanged || parsedRuleset === null}
                      className="bg-[#f47b64] text-[#241614]"
                    >
                      <Save />
                      Enregistrer le ruleset
                    </LoadingButton>
                  </div>
                </form>
              ) : (
                <div className="relative overflow-hidden rounded-xl border border-white/[.06] bg-black/15">
                  <div className="flex items-center justify-between border-b border-white/[.05] px-4 py-2">
                    <span className="text-[8px] font-semibold uppercase tracking-[.14em] text-[#625e5a]">
                      JSON actif
                    </span>
                    <Badge variant="outline">
                      {Object.keys(workspace.ruleset).length} règle
                      {Object.keys(workspace.ruleset).length > 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <pre className="max-h-96 overflow-auto p-4 font-mono text-[10px] leading-5 text-[#aaa5a0]">
                    <code>{JSON.stringify(workspace.ruleset, null, 2)}</code>
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {error && (
        <div className="mt-4 flex items-center gap-2 text-[10px] text-red-300">
          <RefreshCw className="size-3" />
          {error}
        </div>
      )}
    </>
  );
}
