"use client";
import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { PageHeader } from "@/components/shared/page-header";
import type { TaskStatus } from "@/lib/api/types";
import { usePlanningStore } from "@/stores/planning-store";
import { useWorkspaceDomainStore } from "@/stores/workspace-domain-store";
import { NewTaskDialog } from "./new-task-dialog";
import { TaskSheet } from "./task-sheet";
const labels: Record<TaskStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  BLOCKED: "Bloquées",
  IN_REVIEW: "En revue",
  DONE: "Terminées",
  CANCELLED: "Annulées",
};
const columns: TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "IN_REVIEW",
  "DONE",
];
export function IntegratedTasks({
  workspaceId,
  initialTaskId,
}: {
  workspaceId: string;
  initialTaskId?: string;
}) {
  const { tasks, goals, loading, error, load } = usePlanningStore();
  const loadDomains = useWorkspaceDomainStore((s) => s.load);
  useEffect(() => {
    void load(workspaceId);
    void loadDomains(workspaceId);
  }, [load, loadDomains, workspaceId]);
  return (
    <>
      <PageHeader
        eyebrow="Travail du workspace"
        title="Tâches"
        description="Création, assignation, dépendances, blocages et validation synchronisés avec le backend."
        actions={
          <>
            <LoadingButton
              loading={loading}
              onClick={() => void load(workspaceId, true)}
              size="icon-lg"
              variant="outline"
            >
              <RefreshCw />
            </LoadingButton>
            <NewTaskDialog workspaceId={workspaceId} />
          </>
        }
      />
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-400/15 p-3 text-[10px] text-red-300">
          <AlertCircle className="size-4" />
          {error}
        </div>
      )}
      <div className="grid gap-3 xl:grid-cols-5">
        {columns.map((status) => (
          <section
            key={status}
            className="min-h-72 rounded-xl border border-white/[.06] bg-white/[.012] p-3"
          >
            <header className="mb-3 flex justify-between">
              <h2 className="text-xs">{labels[status]}</h2>
              <Badge>{tasks.filter((t) => t.status === status).length}</Badge>
            </header>
            <div className="grid gap-2">
              {tasks
                .filter((t) => t.status === status)
                .map((task) => (
                  <TaskSheet
                    key={task.id}
                    task={task}
                    defaultOpen={task.id === initialTaskId}
                  >
                    <Card className="cursor-pointer bg-[#191715]">
                      <CardContent className="p-3">
                        <Badge
                          variant="outline"
                          className="max-w-full truncate text-[7px]"
                        >
                          {goals.find((g) => g.id === task.goalId)?.title ??
                            "Sans objectif"}
                        </Badge>
                        <h3 className="mt-3 text-[10px] leading-4">
                          {task.title}
                        </h3>
                        <div className="mt-4 flex justify-between text-[8px] text-muted-foreground">
                          <span>{task.priority}</span>
                          <span>
                            {task.assigneeId ? "Assignée" : "Non assignée"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </TaskSheet>
                ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
