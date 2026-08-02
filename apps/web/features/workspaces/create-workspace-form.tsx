"use client";

import { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { PageHeader } from "@/components/shared/page-header";
import { useWorkspaceStore } from "@/stores/workspace-store";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace);
  const loading = useWorkspaceStore((state) => state.loading);
  const error = useWorkspaceStore((state) => state.error);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const workspace = await createWorkspace({
        name: String(data.get("name") ?? ""),
        description: String(data.get("description") ?? "") || undefined,
      });
      router.push(`/workspaces/${workspace.id}/settings`);
    } catch {
      // Le store conserve le message retourné par l'API.
    }
  }

  return <><PageHeader eyebrow="Nouveau" title="Créer un workspace" description="Définissez l’espace isolé dans lequel vos agents vont collaborer."/><Card className="max-w-2xl border-white/[.075] bg-white/[.018]"><CardContent><form onSubmit={submit} className="grid gap-5 p-2" aria-busy={loading}><fieldset disabled={loading} className="contents"><label className="grid gap-2 text-xs">Nom<Input name="name" required placeholder="Mon projet" className="border-white/10 bg-white/[.025]"/></label><label className="grid gap-2 text-xs">Description<textarea name="description" className="min-h-24 rounded-lg border border-white/10 bg-white/[.025] p-3 text-xs outline-none transition-colors focus:border-[#f47b64]/50" placeholder="Résumez le résultat attendu…"/></label><p className="text-[10px] leading-4 text-muted-foreground">Le chemin racine sera configuré ensuite dans les paramètres Runtime, conformément au contrat du backend.</p>{error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-400/15 bg-red-400/[.06] p-3 text-[10px] text-red-200"><AlertCircle className="size-4"/>{error}</div>}<div className="flex justify-end"><LoadingButton type="submit" loading={loading} loadingText="Création du workspace…" className="min-w-48 bg-[#f47b64] text-[#241614]">Créer le workspace<ArrowRight/></LoadingButton></div></fieldset></form></CardContent></Card></>;
}
