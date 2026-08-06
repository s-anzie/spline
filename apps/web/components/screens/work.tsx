"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight, Target } from "lucide-react";

import { api, type GoalView, type RunView, type TaskView } from "@/lib/api";
import { since } from "@/lib/format";
import { routes } from "@/lib/routes";
import { useSession } from "@/lib/store";
import { toneOf } from "@/lib/tone";
import { useAction, useResource } from "@/lib/use-hub";
import {
  Empty,
  Loading,
  Meter,
  Note,
  PageHeader,
  Panel,
  Row,
  Stat,
  StatRow,
  Status,
  Stripe,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { AddButton, NewGoal } from "@/components/forms";

/**
 * §4.5, §4.6 — everything in flight, in one reading.
 *
 * This screen exists because the console had the right pieces in the wrong
 * shape. Goals, Tasks and Runs each had a page, and a person who had just
 * asked the team for something had to visit all three to learn what happened:
 * find the goal, open it, read its tasks, open one, find its run, read its
 * status. Six clicks and a mental join to answer "is anything happening".
 *
 * The three are not three things. They are one thing at three depths — a goal
 * is why, a task is what, a run is the attempt — and the join between them is
 * the answer everybody actually wants. So they are one screen: the goal with
 * its progress, its tasks under it, and each task's live state beside it.
 *
 * The separate pages remain for the cases that genuinely need them (one run's
 * full trace, one task's blockers). What is gone is the obligation to go
 * there to learn whether anything is moving.
 */
export function Work() {
  const workspaceId = useSession((state) => state.workspaceId)!;

  const goals = useResource(() => api.goals.list(workspaceId), [workspaceId], {
    pollMs: 15_000,
  });
  const tasks = useResource(() => api.tasks.list(workspaceId), [workspaceId], {
    pollMs: 15_000,
  });
  /**
   * Polled faster than the rest: a run is the part that moves. A goal changes
   * when a task completes, a task when somebody acts, a run every few seconds.
   */
  const runs = useResource(() => api.runs.list(workspaceId), [workspaceId], {
    pollMs: 6_000,
  });

  const allGoals = goals.data ?? [];
  const allTasks = tasks.data ?? [];
  // Held in a memo rather than defaulted inline: `?? []` builds a new array on
  // every render, which would rebuild the map below every time regardless of
  // whether a run actually changed.
  const allRuns = useMemo(() => runs.data ?? [], [runs.data]);

  /**
   * The newest run per task, which is the only one that answers "what is it
   * doing now". Older attempts belong to the run screen, where somebody is
   * asking a different question.
   */
  const latestRun = useMemo(() => {
    const byTask = new Map<string, RunView>();
    for (const run of allRuns) {
      const held = byTask.get(run.taskId);
      if (!held || (run.startedAt ?? "") > (held.startedAt ?? "")) {
        byTask.set(run.taskId, run);
      }
    }
    return byTask;
  }, [allRuns]);

  const tasksOf = (goalId: string) => allTasks.filter((task) => task.goalId === goalId);
  /**
   * Work nobody stated a reason for. Shown rather than hidden: a task with no
   * goal is usually a mistake worth seeing, and silently dropping it from the
   * only screen that lists work is how it stays lost.
   */
  const unattached = allTasks.filter(
    (task) => !task.goalId || !allGoals.some((goal) => goal.id === task.goalId),
  );

  const running = allRuns.filter((run) => run.status === "RUNNING").length;
  const open = allTasks.filter(
    (task) => task.status !== "DONE" && task.status !== "CANCELLED",
  ).length;
  const blocked = allTasks.filter((task) => task.openBlockerCount > 0).length;

  const loading = goals.loading || tasks.loading;
  const error = goals.error ?? tasks.error;

  /**
   * Whether anything will start on its own — the single switch between "I
   * asked and the team worked" and "I asked and nothing happened".
   *
   * It is set on Workspace → Governance, three levels down, which is the
   * right home for a rule the hub enforces and the wrong place to DISCOVER
   * it. Somebody reads this screen precisely when they are wondering why
   * nothing moved, so the answer belongs here, next to the emptiness it
   * explains.
   */
  const waiting = allTasks.filter((task) => task.status === "READY").length;

  return (
    <>
      <PageHeader
        title="Work"
        actions={<NewGoal trigger={<AddButton>State a goal</AddButton>} />}
      />

      <StatRow>
        <Stat label="Running now" value={running} tone={running > 0 ? "live" : "quiet"} />
        <Stat label="Open tasks" value={open} />
        <Stat label="Blocked" value={blocked} tone={blocked > 0 ? "signal" : "quiet"} />
        <Stat label="Goals" value={allGoals.length} />
      </StatRow>

      <Automation workspaceId={workspaceId} waiting={waiting} />

      {loading ? <Loading rows={4} /> : null}
      {error ? <Note>{error}</Note> : null}

      {!loading && allGoals.length === 0 && unattached.length === 0 ? (
        <Empty icon={Target} title="Nothing under way">
          State a goal and cut it into tasks — or open a conversation and ask
          the manager to, which is the same thing with fewer clicks.
        </Empty>
      ) : null}

      <div className="space-y-6">
        {allGoals.map((goal) => (
          <GoalBlock
            key={goal.id}
            goal={goal}
            tasks={tasksOf(goal.id)}
            latestRun={latestRun}
          />
        ))}

        {unattached.length > 0 ? (
          <section>
            <h2 className="text-muted-foreground mb-2 text-sm font-medium">
              Not under any goal
            </h2>
            <Panel>
              {unattached.map((task) => (
                <TaskRow key={task.id} task={task} run={latestRun.get(task.id)} />
              ))}
            </Panel>
          </section>
        ) : null}
      </div>
    </>
  );
}

function GoalBlock({
  goal,
  tasks,
  latestRun,
}: {
  goal: GoalView;
  tasks: TaskView[];
  latestRun: Map<string, RunView>;
}) {
  const live = tasks.some((task) => latestRun.get(task.id)?.status === "RUNNING");

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-3">
        <Link
          href={routes.goal(goal.id)}
          className="group flex min-w-0 items-baseline gap-2"
        >
          <h2 className="truncate text-sm font-medium group-hover:underline group-hover:underline-offset-2">
            {goal.title}
          </h2>
          <ChevronRight className="text-muted-foreground size-3 shrink-0 self-center" />
        </Link>
        <Status value={goal.status} />
        {live ? (
          <span className="text-live inline-flex items-center gap-1.5 text-xs">
            <span className="bg-live size-1.5 animate-pulse rounded-full" />
            working
          </span>
        ) : null}
        <span className="text-muted-foreground ml-auto shrink-0 text-xs">
          {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
        </span>
      </div>

      <div className="mb-3 max-w-md">
        <Meter value={goal.progress} />
      </div>

      {tasks.length === 0 ? (
        <p className="text-muted-foreground border-border/60 rounded-md border border-dashed px-3 py-4 text-xs">
          No task yet — this goal states an intention nobody has cut up.
        </p>
      ) : (
        <Panel>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} run={latestRun.get(task.id)} />
          ))}
        </Panel>
      )}
    </section>
  );
}

/**
 * One task, with the answer to "what is it doing" on the same line.
 *
 * The run's state is what makes this row worth reading. A task that says
 * READY and nothing else leaves the reader to guess whether anything picked
 * it up; the same row saying "running, 2 min" does not.
 */
function TaskRow({ task, run }: { task: TaskView; run: RunView | undefined }) {
  const running = run?.status === "RUNNING";
  const attempt = run?.attempts.at(-1);
  /**
   * The last thing the agent said or reached for. §17 — this is the line that
   * turns a spinner into information, and it comes for free from the trace
   * the run already carries.
   */
  const doing = attempt?.trace?.at(-1)?.text ?? null;

  return (
    <Row className="py-3">
      <Stripe tone={toneOf(task.status)} live={running} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2.5">
          <Link
            href={routes.task(task.id)}
            className="truncate text-sm hover:underline hover:underline-offset-2"
          >
            {task.title}
          </Link>
          <Status value={task.status} />
          {task.openBlockerCount > 0 ? (
            <span className="text-signal text-xs">
              {task.openBlockerCount} blocked
            </span>
          ) : null}
        </div>

        {running && doing ? (
          <p className="text-muted-foreground mt-1 truncate text-xs">
            <span className="text-live">·</span> {doing}
          </p>
        ) : null}
      </div>

      {run ? (
        <Link
          href={routes.run(run.runId)}
          className="text-muted-foreground hover:text-foreground shrink-0 text-xs transition-colors"
        >
          {running
            ? `running ${run.startedAt ? since(run.startedAt) : ""}`
            : run.finishedAt
              ? since(run.finishedAt)
              : run.status.toLowerCase()}
        </Link>
      ) : (
        <span className="text-muted-foreground shrink-0 text-xs">never run</span>
      )}
    </Row>
  );
}

/**
 * §9 — said here because here is where its absence is felt.
 *
 * Nothing is duplicated: the ceiling and its numbers stay on Governance,
 * where a rule the hub enforces belongs. What lives here is the one sentence
 * that closes the gap between a queue full of READY tasks and a workspace
 * where nothing runs — and the button that fixes it without a hunt.
 */
function Automation({
  workspaceId,
  waiting,
}: {
  workspaceId: string;
  waiting: number;
}) {
  const workspace = useResource(() => api.workspaces.get(workspaceId), [workspaceId]);
  const { run, pending } = useAction();

  const bag = (workspace.data?.settings ?? {}) as Record<string, unknown>;
  const current = (
    typeof bag.automation === "object" && bag.automation !== null ? bag.automation : {}
  ) as Record<string, unknown>;
  const on = current.automatic === true;

  // Nothing to say when it is on, or before we know: a banner that is always
  // there is a banner nobody reads.
  if (!workspace.data || on) {
    return null;
  }

  return (
    <Note tone="waiting">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>
          {waiting > 0
            ? `${waiting} ${waiting === 1 ? "task is" : "tasks are"} ready and nothing will pick ${waiting === 1 ? "it" : "them"} up — this workspace does not start work on its own.`
            : "This workspace does not start work on its own. Tasks will sit ready until somebody dispatches each one."}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            void run(
              () =>
                api.workspaces.update(workspaceId, {
                  settings: { ...bag, automation: { ...current, automatic: true } },
                }),
              workspace.reload,
            )
          }
        >
          {pending ? "Turning on…" : "Let it start work"}
        </Button>
      </span>
    </Note>
  );
}
