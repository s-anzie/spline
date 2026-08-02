"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Command,
  FileText,
  Flag,
  Search,
  Server,
  SquareCheckBig,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePlanningStore } from "@/stores/planning-store";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

type Result = {
  id: string;
  label: string;
  detail: string;
  href: string;
  icon: typeof Flag;
};

export function CommandSearch({ workspaceId }: { workspaceId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const goals = usePlanningStore((state) => state.goals);
  const tasks = usePlanningStore((state) => state.tasks);
  const { agents, artifacts, processes } = useWorkspaceDomainStore();

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  const results = useMemo(() => {
    const items: Result[] = workspaces.map((workspace) => ({
      id: `workspace-${workspace.id}`,
      label: workspace.name,
      detail: "Workspace",
      href: `/workspaces/${workspace.id}`,
      icon: Command,
    }));
    if (workspaceId) {
      items.push(
        ...goals.map((goal) => ({
          id: `goal-${goal.id}`,
          label: goal.title,
          detail: `Objectif · ${goal.status}`,
          href: `/workspaces/${workspaceId}/goals/${goal.id}`,
          icon: Flag,
        })),
        ...tasks.map((task) => ({
          id: `task-${task.id}`,
          label: task.title,
          detail: `Tâche · ${task.status}`,
          href: `/workspaces/${workspaceId}/tasks?task=${task.id}`,
          icon: SquareCheckBig,
        })),
        ...agents.map((agent) => ({
          id: `agent-${agent.id}`,
          label: agent.displayName,
          detail: `Agent · ${agent.status}`,
          href: `/workspaces/${workspaceId}/agents/${agent.id}`,
          icon: Bot,
        })),
        ...artifacts.map((artifact) => ({
          id: `artifact-${artifact.id}`,
          label: artifact.name,
          detail: `Artefact · ${artifact.type}`,
          href: `/workspaces/${workspaceId}/artifacts/${artifact.id}`,
          icon: FileText,
        })),
        ...processes.map((process) => ({
          id: `process-${process.id}`,
          label: process.name,
          detail: `Processus · ${process.status}`,
          href: `/workspaces/${workspaceId}/processes/${process.id}`,
          icon: Server,
        })),
      );
    }
    const normalized = query.trim().toLocaleLowerCase("fr");
    return (
      normalized
        ? items.filter((item) =>
            `${item.label} ${item.detail}`
              .toLocaleLowerCase("fr")
              .includes(normalized),
          )
        : items
    ).slice(0, 12);
  }, [
    agents,
    artifacts,
    goals,
    processes,
    query,
    tasks,
    workspaceId,
    workspaces,
  ]);

  function navigate(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative flex h-9 flex-1 items-center rounded-md border border-white/[.075] bg-white/[.025] pl-9 pr-11 text-left text-xs text-muted-foreground transition-[background-color,border-color,box-shadow] duration-200 hover:bg-white/[.04] sm:max-w-65"
      >
        <Search className="absolute left-3 size-4 transition-colors group-hover:text-[#f47b64]" />
        Rechercher ou commander…
        <kbd className="absolute right-2.5 hidden items-center gap-0.5 rounded border border-white/10 px-1.5 py-0.5 text-[9px] sm:flex">
          <Command className="size-2.5" />K
        </kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[24%] max-w-xl translate-y-0 border-white/10 bg-[#171513] p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Recherche</DialogTitle>
            <DialogDescription>
              Rechercher dans le workspace actif.
            </DialogDescription>
          </DialogHeader>
          <div className="relative border-b border-white/[.075]">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#f47b64]" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                workspaceId
                  ? "Objectif, tâche, agent, artefact, processus…"
                  : "Rechercher un workspace…"
              }
              className="h-13 border-0 bg-transparent pl-11 pr-12 text-sm focus-visible:ring-0"
            />
          </div>
          <div className="grid max-h-80 gap-1 overflow-y-auto p-2">
            {results.map((result) => (
              <button
                type="button"
                key={result.id}
                onClick={() => navigate(result.href)}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[.055]"
              >
                <span className="grid size-8 place-items-center rounded-md bg-white/[.04] text-muted-foreground group-hover:text-[#f47b64]">
                  <result.icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <strong className="block truncate text-xs font-medium">
                    {result.label}
                  </strong>
                  <small className="text-[9px] text-muted-foreground">
                    {result.detail}
                  </small>
                </span>
              </button>
            ))}
            {!results.length && (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                Aucun résultat dans les données chargées.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
