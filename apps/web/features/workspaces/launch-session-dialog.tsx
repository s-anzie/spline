"use client";

import { FormEvent, useMemo, useState } from "react";
import { Check, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LoadingButton } from "@/components/ui/loading-button";
import { usePlanningStore } from "@/stores/planning-store";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";

export function LaunchSessionDialog() {
  const [launched, setLaunched] = useState(false);
  const { agents, machines, sessions, startSession, pendingAction, error } =
    useWorkspaceDomainStore();
  const tasks = usePlanningStore((state) => state.tasks);
  const activeAgents = new Set(
    sessions.filter((session) => !session.endedAt).map((session) => session.agentId),
  );
  const managers = useMemo(
    () => agents.filter((agent) => agent.promptProfile["role"] === "manager"),
    [agents],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await startSession({
        agentId: String(data.get("agentId")),
        machineId: String(data.get("machineId")),
        taskId: String(data.get("taskId")) || undefined,
        instruction: String(data.get("instruction")),
      });
      setLaunched(true);
    } catch {
      // L’erreur du store reste affichée dans le formulaire.
    }
  }

  return (
    <Dialog onOpenChange={(open) => !open && setLaunched(false)}>
      <DialogTrigger
        render={<Button className="bg-[#f47b64] text-[#241614]" />}
      >
        <Play /> Parler au manager
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-[#191715] text-foreground">
        <DialogHeader>
          <DialogTitle>
            {launched ? "Instruction transmise" : "Nouvelle conversation"}
          </DialogTitle>
          <DialogDescription>
            Le manager est ton interlocuteur unique. Il coordonnera les
            collaborateurs et te remontera uniquement les décisions nécessaires.
          </DialogDescription>
        </DialogHeader>
        {launched ? (
          <div className="grid place-items-center py-8">
            <Check className="size-10 text-emerald-400" />
            <p className="mt-3 text-xs">Le manager traite ton instruction.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <label className="grid gap-2 text-xs">
              Manager
              <select
                name="agentId"
                required
                className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3"
              >
                {managers.map((agent) => (
                  <option
                    key={agent.id}
                    value={agent.id}
                    disabled={activeAgents.has(agent.id)}
                  >
                    {agent.displayName}
                    {activeAgents.has(agent.id) ? " · occupé" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-xs">
              Machine
              <select
                name="machineId"
                required
                className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3"
              >
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.hostname} · {machine.runtimeStatus}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-xs">
              Tâche liée
              <select
                name="taskId"
                className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3"
              >
                <option value="">Sans tâche</option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-xs">
              Ton objectif ou ta question
              <textarea
                name="instruction"
                required
                minLength={3}
                rows={6}
                placeholder="Décris le résultat attendu, les contraintes et les critères de réussite…"
                className="resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs outline-none transition focus:border-[#f47b64]/50"
              />
            </label>
            {!managers.length && (
              <p className="text-[10px] text-amber-300">
                Aucun agent manager n’est configuré dans ce workspace.
              </p>
            )}
            {error && <p className="text-[10px] text-red-300">{error}</p>}
            <LoadingButton
              type="submit"
              disabled={!managers.length || !machines.length}
              loading={pendingAction === "session:start"}
              loadingText="Transmission…"
              className="bg-[#f47b64] text-[#241614]"
            >
              Envoyer au manager
            </LoadingButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
