"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertCircle, ArrowRight, FolderKanban, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingButton } from "@/components/ui/loading-button";
import { workspaceColor, workspaceInitials } from "@/lib/workspace-presentation";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { WorkspaceActions } from "./workspace-actions";

export function WorkspacesList() {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const loading = useWorkspaceStore((state) => state.loading);
  const initialized = useWorkspaceStore((state) => state.initialized);
  const error = useWorkspaceStore((state) => state.error);
  const load = useWorkspaceStore((state) => state.loadWorkspaces);
  useEffect(() => { void load(); }, [load]);

  return <><PageHeader eyebrow="Organisation" title="Workspaces" description="Chaque espace isole ses objectifs, agents, process, tâches et artefacts." actions={<><LoadingButton onClick={() => void load(true)} loading={loading} variant="outline" size="icon-lg" aria-label="Actualiser"><RefreshCw/></LoadingButton><Button nativeButton={false} render={<Link href="/workspaces/new"/>} className="bg-[#f47b64] text-[#241614]"><Plus/>Nouveau</Button></>}/>
    {loading && !initialized && <div className="grid min-h-56 place-items-center"><div className="flex items-center gap-3 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin text-[#f47b64]"/>Synchronisation des workspaces…</div></div>}
    {error && <Card className="border-red-400/15 bg-red-400/[.035]"><CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center"><AlertCircle className="size-5 text-red-300"/><div className="flex-1"><h2 className="text-sm font-medium">Backend indisponible</h2><p className="mt-1 text-[10px] text-muted-foreground">{error}</p></div><Button onClick={() => void load(true)} variant="outline"><RefreshCw/>Réessayer</Button></CardContent></Card>}
    {!loading && !error && workspaces.length === 0 && <Card className="border-dashed border-white/10 bg-white/[.012]"><CardContent className="grid min-h-64 place-items-center p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-xl bg-[#f47b64]/10 text-[#f47b64]"><FolderKanban/></span><h2 className="mt-5 text-base font-medium">Votre premier espace de travail</h2><p className="mx-auto mt-2 max-w-sm text-[11px] leading-5 text-muted-foreground">Créez un workspace pour délimiter le projet, ses objectifs et les agents autorisés à y intervenir.</p><Button nativeButton={false} render={<Link href="/workspaces/new"/>} className="mt-5 bg-[#f47b64] text-[#241614]"><Plus/>Créer un workspace</Button></div></CardContent></Card>}
    {!error && workspaces.length > 0 && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{workspaces.map(workspace => { const color = workspaceColor(workspace.id); return <Card key={workspace.id} className="border-white/[.075] bg-white/[.018]"><CardContent className="p-5"><div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-lg text-xs font-semibold" style={{backgroundColor:`${color}18`,color}}>{workspaceInitials(workspace.name)}</span><WorkspaceActions workspace={workspace}/></div><h2 className="mt-5 text-sm font-medium">{workspace.name}</h2><p className="mt-1 line-clamp-2 min-h-8 text-[10px] leading-4 text-muted-foreground">{workspace.description || "Aucune description"}</p><div className="mt-5 flex items-center justify-between"><Badge variant="outline" className="border-white/[.07] text-[9px]">{workspace.status === "ACTIVE" ? "Actif" : workspace.status}</Badge><Button nativeButton={false} render={<Link href={`/workspaces/${workspace.id}`}/>} size="xs" variant="ghost">Se focaliser<ArrowRight/></Button></div></CardContent></Card>;})}</div>}
  </>;
}
