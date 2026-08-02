"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, FolderKanban, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

export function OnboardingFlow() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace);
  const loading = useWorkspaceStore((state) => state.loading);
  const error = useWorkspaceStore((state) => state.error);
  const [stage, setStage] = useState<"success" | "workspace">("success");

  useEffect(() => {
    const timer = window.setTimeout(() => setStage("workspace"), 1150);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const workspace = await createWorkspace({ name: String(data.get("name")), description: String(data.get("description")) || undefined });
      router.push(`/workspaces/${workspace.id}`);
    } catch {
      // Le store affiche la réponse du backend sans quitter l'onboarding.
    }
  }

  return <div className="relative z-10 w-full max-w-xl">
    {stage === "success" ? <div className="animate-onboarding-success text-center"><span className="mx-auto grid size-20 place-items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 shadow-[0_0_70px_-20px_rgba(52,211,153,.8)]"><Check className="size-9 animate-check-in"/></span><p className="mt-7 text-[10px] uppercase tracking-[.24em] text-emerald-300">Compte créé</p><h1 className="mt-2 text-3xl font-medium tracking-tight">Bienvenue, {user?.displayName.split(" ")[0]}</h1><p className="mt-3 text-xs text-muted-foreground">Préparation de votre espace de pilotage…</p></div> : <Card className="animate-onboarding-card border-white/[.09] bg-[#181614]/95 shadow-2xl"><CardContent className="p-7 sm:p-9"><div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f47b64]/10 text-[#f47b64]"><FolderKanban/></span><div><p className="flex items-center gap-1.5 text-[9px] uppercase tracking-[.18em] text-[#f47b64]"><Sparkles className="size-3"/>Première étape</p><h1 className="mt-1 text-2xl font-medium">Créez votre premier workspace</h1><p className="mt-2 text-[11px] leading-5 text-muted-foreground">Un workspace concentre le contexte, les objectifs, les tâches et les agents d’un seul projet.</p></div></div><form onSubmit={submit} aria-busy={loading} className="mt-8 grid gap-5"><fieldset disabled={loading} className="contents"><label className="grid gap-2 text-xs">Nom du projet<Input autoFocus name="name" required placeholder="Mon produit" className="h-10 border-white/10 bg-white/[.025]"/></label><label className="grid gap-2 text-xs">Résultat attendu <span className="font-normal text-muted-foreground">(facultatif)</span><textarea name="description" placeholder="Ce que ce projet doit accomplir…" className="min-h-24 rounded-lg border border-white/10 bg-white/[.025] p-3 text-xs outline-none transition focus:border-[#f47b64]/40"/></label>{error && <p role="alert" className="rounded-lg border border-red-400/15 bg-red-400/[.06] p-3 text-[10px] text-red-200">{error}</p>}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><Button type="button" onClick={() => router.push("/dashboard")} variant="ghost" className="text-muted-foreground">Je le ferai plus tard</Button><LoadingButton type="submit" loading={loading} loadingText="Création…" className="min-w-44 bg-[#f47b64] text-[#241614]">Créer et continuer<ArrowRight/></LoadingButton></div></fieldset></form></CardContent></Card>}
  </div>;
}
