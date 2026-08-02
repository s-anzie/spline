"use client";

import { FormEvent, useState } from "react";
import { Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import type { Priority } from "@/lib/api/types";
import { usePlanningStore } from "@/stores/planning-store";

export function NewGoalDialog({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const createGoal = usePlanningStore((state) => state.createGoal);
  const pending = usePlanningStore((state) => state.mutating);
  const error = usePlanningStore((state) => state.error);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try { await createGoal(workspaceId, { title: String(data.get("title")), description: String(data.get("description")) || undefined, priority: String(data.get("priority")) as Priority }); setOpen(false); }
    catch {
      // Le store conserve l'erreur et la boîte de dialogue reste ouverte.
    }
  }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button className="bg-[#f47b64] text-[#241614]"/>}><Plus/>Donner un objectif</DialogTrigger><DialogContent className="border-white/10 bg-[#1b1918] p-7 text-[#f2efea] sm:max-w-md"><DialogHeader><span className="mb-2 grid size-9 place-items-center rounded-lg bg-[#f47b64]/10 text-[#f47b64]"><Target/></span><DialogTitle>Nouvel objectif</DialogTitle><DialogDescription>Définissez un résultat mesurable pour ce workspace.</DialogDescription></DialogHeader><form onSubmit={submit} className="grid gap-4"><fieldset disabled={pending} className="contents"><label className="grid gap-2 text-xs">Résultat attendu<Input name="title" required autoFocus placeholder="Stabiliser le runtime pour la bêta"/></label><label className="grid gap-2 text-xs">Contexte<textarea name="description" className="min-h-24 rounded-lg border border-white/10 bg-white/[.025] p-3 outline-none"/></label><label className="grid gap-2 text-xs">Priorité<select name="priority" defaultValue="MEDIUM" className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3"><option value="LOW">Faible</option><option value="MEDIUM">Normale</option><option value="HIGH">Haute</option><option value="CRITICAL">Critique</option></select></label>{error && <p className="text-[10px] text-red-300">{error}</p>}<LoadingButton type="submit" loading={pending} loadingText="Création…" className="bg-[#f47b64] text-[#241614]">Créer l’objectif</LoadingButton></fieldset></form></DialogContent></Dialog>;
}
