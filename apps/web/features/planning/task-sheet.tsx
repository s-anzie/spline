"use client";
import { FormEvent } from "react";
import { AlertTriangle, Check, Save, UserRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { Task, TaskStatus } from "@/lib/api/types";
import { usePlanningStore } from "@/stores/planning-store";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";

const labels: Record<TaskStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  BLOCKED: "Bloquée",
  IN_REVIEW: "En revue",
  DONE: "Terminée",
  CANCELLED: "Annulée",
};
export function TaskSheet({
  task,
  children,
  defaultOpen = false,
}: {
  task: Task;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const action = usePlanningStore((s) => s.taskAction);
  const update = usePlanningStore((s) => s.updateTask);
  const linkTaskToGoal = usePlanningStore((s) => s.linkTaskToGoal);
  const goals = usePlanningStore((s) => s.goals);
  const pending = usePlanningStore((s) => s.mutating);
  const error = usePlanningStore((s) => s.error);
  const agents = useWorkspaceDomainStore((s) => s.agents);
  async function block(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      await action(task.id, "blocker", String(data.get("reason")));
    } catch {
      /* L'erreur du store reste affichée. */
    }
  }
  async function edit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      await update(task.id, {
        title: String(data.get("title")),
        description: String(data.get("description")) || undefined,
        priority: String(data.get("priority")),
        dependencies: String(data.get("dependencies"))
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      });
    } catch {
      /* L'erreur du store reste affichée. */
    }
  }
  return (
    <Sheet defaultOpen={defaultOpen}>
      <SheetTrigger render={<button className="w-full text-left" />}>
        {children}
      </SheetTrigger>
      <SheetContent className="dark w-full overflow-y-auto border-white/10 bg-[#171513] text-foreground sm:max-w-md">
        <SheetHeader className="border-b border-white/[.06] pb-5">
          <div className="flex gap-2">
            <Badge variant="outline">{task.priority}</Badge>
            <Badge variant="outline">{labels[task.status]}</Badge>
          </div>
          <SheetTitle className="mt-3 text-lg">{task.title}</SheetTitle>
          <SheetDescription>
            {task.description || "Aucune description"}
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-5 p-5">
          <label className="grid gap-2 text-xs">
            <span>Objectif auquel cette tâche contribue</span>
            <select
              disabled={pending || goals.length === 0}
              value={task.goalId ?? ""}
              onChange={(event) => event.target.value && void linkTaskToGoal(task.id, event.target.value)}
              className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3"
            >
              <option value="" disabled>{goals.length ? "Choisir un objectif…" : "Aucun objectif disponible"}</option>
              {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
            </select>
            {!task.goalId && <span className="text-[9px] text-amber-300">Cette tâche est orpheline et ne compte dans aucune progression.</span>}
          </label>
          <form
            onSubmit={edit}
            className="grid gap-3 rounded-lg border border-white/[.06] p-3"
          >
            <Input name="title" defaultValue={task.title} required />
            <textarea
              name="description"
              defaultValue={task.description ?? ""}
              className="min-h-20 rounded-lg border border-white/10 bg-white/[.025] p-3 text-xs outline-none"
            />
            <select
              name="priority"
              defaultValue={task.priority}
              className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3 text-xs"
            >
              <option value="LOW">Faible</option>
              <option value="MEDIUM">Normale</option>
              <option value="HIGH">Haute</option>
              <option value="CRITICAL">Critique</option>
            </select>
            <Input
              name="dependencies"
              defaultValue={task.dependencies.join(", ")}
              placeholder="IDs des dépendances séparés par des virgules"
            />
            <LoadingButton
              type="submit"
              loading={pending}
              size="sm"
              variant="outline"
            >
              <Save />
              Enregistrer les détails
            </LoadingButton>
          </form>
          <label className="grid gap-2 text-xs">
            <span className="flex items-center gap-2">
              <UserRound className="size-3.5" />
              Assignation
            </span>
            <select
              disabled={pending}
              value={task.assigneeId ?? ""}
              onChange={(e) =>
                void action(task.id, "assign", e.target.value, "AGENT")
              }
              className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3"
            >
              <option value="">Non assignée</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.displayName}
                </option>
              ))}
            </select>
          </label>
          <div>
            <p className="mb-2 text-[9px] uppercase tracking-wider text-muted-foreground">
              Changer le statut
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as TaskStatus[]
              ).map((status) => (
                <LoadingButton
                  key={status}
                  loading={pending && task.status !== status}
                  disabled={pending || task.status === status}
                  onClick={() => void action(task.id, "status", status)}
                  size="xs"
                  variant="outline"
                >
                  {labels[status]}
                </LoadingButton>
              ))}
            </div>
          </div>
          <form
            onSubmit={block}
            className="rounded-lg border border-amber-400/10 bg-amber-400/[.025] p-3"
          >
            <label className="grid gap-2 text-[9px]">
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-3.5 text-amber-300" />
                Signaler un blocage
              </span>
              <input
                name="reason"
                required
                placeholder="Raison du blocage…"
                className="h-8 rounded-md border border-white/10 bg-black/10 px-2 outline-none"
              />
            </label>
            <LoadingButton
              type="submit"
              loading={pending}
              size="xs"
              variant="ghost"
              className="mt-2 text-amber-200"
            >
              Signaler
            </LoadingButton>
          </form>
          {task.validationState === "PENDING" && (
            <div className="flex gap-2">
              <LoadingButton
                loading={pending}
                onClick={() => void action(task.id, "reject")}
                variant="destructive"
                className="flex-1"
              >
                <X />
                Rejeter
              </LoadingButton>
              <LoadingButton
                loading={pending}
                onClick={() => void action(task.id, "validate")}
                className="flex-1 bg-emerald-500 text-[#07130c]"
              >
                <Check />
                Valider
              </LoadingButton>
            </div>
          )}
          {error && (
            <p role="alert" className="text-[10px] text-red-300">
              {error}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
