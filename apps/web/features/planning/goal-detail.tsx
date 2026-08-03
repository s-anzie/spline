"use client";
import Link from "next/link";
import { FormEvent, useEffect } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Circle,
  Check,
  CheckCircle2,
  Save,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/shared/page-header";
import type { GoalStatus } from "@/lib/api/types";
import { usePlanningStore } from "@/stores/planning-store";
import { NewTaskDialog } from "./new-task-dialog";
import { TaskSheet } from "./task-sheet";
const labels: Record<GoalStatus, string> = {
  PLANNED: "Planifié",
  ACTIVE: "Actif",
  BLOCKED: "Bloqué",
  AT_RISK: "À risque",
  REVIEW: "En revue",
  COMPLETED: "Terminé",
  CANCELLED: "Annulé",
};
export function GoalDetail({
  workspaceId,
  goalId,
}: {
  workspaceId: string;
  goalId: string;
}) {
  const {
    goals,
    tasks,
    loading,
    mutating,
    error,
    load,
    goalAction,
    updateGoal,
  } = usePlanningStore();
  useEffect(() => {
    void load(workspaceId);
  }, [load, workspaceId]);
  const goal = goals.find((g) => g.id === goalId);
  if (loading)
    return (
      <div className="grid min-h-72 place-items-center text-xs text-muted-foreground">
        Chargement de l’objectif…
      </div>
    );
  if (!goal)
    return (
      <Card>
        <CardContent className="p-6">
          {error || "Objectif introuvable"}
        </CardContent>
      </Card>
    );
  const linked = tasks.filter((t) => t.goalId === goal.id);
  async function block(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get("reason"));
    try {
      await goalAction(goalId, "blocker", reason);
      e.currentTarget.reset();
    } catch {
      /* L'erreur du store reste affichée. */
    }
  }
  async function edit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      await updateGoal(goalId, {
        title: String(data.get("title")),
        description: String(data.get("description")) || undefined,
        priority: String(data.get("priority")),
        successCriteria: String(data.get("criteria"))
          .split("\n")
          .map((v) => v.trim())
          .filter(Boolean),
        dependencies: String(data.get("dependencies"))
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        dueDate: String(data.get("dueDate")) || undefined,
      });
    } catch {
      /* L'erreur reste affichée. */
    }
  }
  return (
    <>
      <Button
        nativeButton={false}
        render={<Link href={`/workspaces/${workspaceId}/plan`} />}
        variant="ghost"
        size="sm"
        className="mb-5 text-muted-foreground"
      >
        <ArrowLeft />
        Plan
      </Button>
      <PageHeader
        eyebrow={
          goal.dueDate
            ? `Échéance · ${new Intl.DateTimeFormat("fr-FR").format(new Date(goal.dueDate))}`
            : "Sans échéance"
        }
        title={goal.title}
        description={goal.description || "Aucune description détaillée."}
      />
      <div className="grid gap-3 xl:grid-cols-[1.3fr_.8fr]">
        <Card className="border-white/[.075] bg-white/[.018]">
          <CardHeader>
            <div className="flex justify-between">
              <h2 className="text-sm">Progression</h2>
              <Badge variant="outline">{labels[goal.status]}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <strong className="text-4xl">{goal.progressPercentage}%</strong>
            <Progress value={goal.progressPercentage} className="mt-4" />
            <div className="mt-6 flex flex-wrap gap-2">
              {(
                [
                  "PLANNED",
                  "ACTIVE",
                  "REVIEW",
                  "COMPLETED",
                  "CANCELLED",
                ] as GoalStatus[]
              ).map((status) => (
                <LoadingButton
                  key={status}
                  loading={mutating && goal.status !== status}
                  disabled={mutating || goal.status === status}
                  onClick={() => void goalAction(goal.id, "status", status)}
                  size="xs"
                  variant="outline"
                >
                  {labels[status]}
                </LoadingButton>
              ))}
            </div>
            <div className="mt-7 flex items-center justify-between gap-3">
              <div><h3 className="text-xs">Travail nécessaire</h3><p className="mt-1 text-[9px] text-muted-foreground">{linked.filter((task) => task.status === "DONE").length} terminée(s) sur {linked.length}</p></div>
              <NewTaskDialog workspaceId={workspaceId} goalId={goal.id} />
            </div>
            <div className="mt-3 grid gap-2">
              {linked.map((task) => (
                <TaskSheet key={task.id} task={task}>
                  <div className="group grid w-full gap-3 rounded-xl border border-white/[.06] bg-white/[.012] p-3.5 text-left transition hover:border-white/[.12] hover:bg-white/[.025] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                    {task.status === "DONE" ? <CheckCircle2 className="size-4 text-emerald-400"/> : <Circle className="size-4 text-muted-foreground transition group-hover:text-[#f47b64]"/>}
                    <span className="min-w-0"><strong className="block truncate text-[10px] font-medium">{task.title}</strong><span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[8px] text-muted-foreground"><span>{task.priority}</span><span>{task.assigneeId ? `Assignée · ${task.assigneeId}` : "Non assignée"}</span><span>{task.dependencies.length} dépendance(s)</span>{task.blockers.length > 0 && <span className="text-amber-300">{task.blockers.length} blocage(s)</span>}</span></span>
                    <Badge variant="outline">{task.status}</Badge>
                  </div>
                </TaskSheet>
              ))}
              {!linked.length && <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-white/[.07] text-center"><div><p className="text-[10px]">Aucune tâche ne contribue encore à cet objectif.</p><p className="mt-1 text-[8px] text-muted-foreground">Ajoutez le premier morceau de travail attendu.</p></div></div>}
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-3">
          <Card className="border-white/[.075] bg-white/[.018]">
            <CardHeader>
              <h2 className="text-sm">Détails et dépendances</h2>
            </CardHeader>
            <CardContent>
              <form onSubmit={edit} className="grid gap-3">
                <Input name="title" defaultValue={goal.title} required />
                <textarea
                  name="description"
                  defaultValue={goal.description ?? ""}
                  className="min-h-20 rounded-lg border border-white/10 bg-white/[.025] p-3 text-xs outline-none"
                />
                <select
                  name="priority"
                  defaultValue={goal.priority}
                  className="h-9 rounded-lg border border-white/10 bg-[#191715] px-3 text-xs"
                >
                  <option value="LOW">Faible</option>
                  <option value="MEDIUM">Normale</option>
                  <option value="HIGH">Haute</option>
                  <option value="CRITICAL">Critique</option>
                </select>
                <Input
                  name="dueDate"
                  type="date"
                  defaultValue={goal.dueDate?.slice(0, 10) ?? ""}
                />
                <textarea
                  name="criteria"
                  defaultValue={goal.successCriteria
                    .map((item) =>
                      typeof item === "string" ? item : JSON.stringify(item),
                    )
                    .join("\n")}
                  placeholder="Un critère par ligne"
                  className="min-h-20 rounded-lg border border-white/10 bg-white/[.025] p-3 text-xs outline-none"
                />
                <Input
                  name="dependencies"
                  defaultValue={goal.dependencies.join(", ")}
                  placeholder="IDs des dépendances"
                />
                <LoadingButton
                  type="submit"
                  loading={mutating}
                  size="sm"
                  variant="outline"
                >
                  <Save />
                  Enregistrer
                </LoadingButton>
              </form>
            </CardContent>
          </Card>
          <Card className="border-white/[.075] bg-white/[.018]">
            <CardHeader>
              <h2 className="text-sm">Critères de succès</h2>
            </CardHeader>
            <CardContent className="grid gap-2">
              {goal.successCriteria.length ? (
                goal.successCriteria.map((item, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-white/[.06] p-3 text-[10px]"
                  >
                    {typeof item === "string" ? item : JSON.stringify(item)}
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  Aucun critère défini.
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="border-amber-400/10 bg-amber-400/[.025]">
            <CardContent className="p-4">
              <form onSubmit={block} className="grid gap-2">
                <label className="flex items-center gap-2 text-[10px]">
                  <AlertTriangle className="size-4 text-amber-300" />
                  Signaler un blocage
                </label>
                <input
                  name="reason"
                  required
                  className="h-8 rounded-md border border-white/10 bg-black/10 px-2 text-[10px] outline-none"
                />
                <LoadingButton
                  type="submit"
                  loading={mutating}
                  size="xs"
                  variant="outline"
                >
                  Signaler
                </LoadingButton>
              </form>
            </CardContent>
          </Card>
          {goal.validationState === "PENDING" && (
            <div className="flex gap-2">
              <LoadingButton
                loading={mutating}
                onClick={() => void goalAction(goal.id, "reject")}
                variant="destructive"
                className="flex-1"
              >
                <X />
                Rejeter
              </LoadingButton>
              <LoadingButton
                loading={mutating}
                onClick={() => void goalAction(goal.id, "validate")}
                className="flex-1 bg-emerald-500 text-[#07130c]"
              >
                <Check />
                Valider
              </LoadingButton>
            </div>
          )}
          {error && <p className="text-[10px] text-red-300">{error}</p>}
        </div>
      </div>
    </>
  );
}
