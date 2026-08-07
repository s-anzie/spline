"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Target } from "lucide-react";

import { api, type GoalView, type RunView, type TaskView } from "@/lib/api";
import { since } from "@/lib/format";
import { routes } from "@/lib/routes";
import { useSession } from "@/lib/store";
import { toneOf } from "@/lib/tone";
import { useAction, useResource } from "@/lib/use-hub";
import { Empty, Loading, Note, PageHeader, TONE_TEXT } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { AddButton, NewGoal } from "@/components/forms";

/**
 * §4.5, §4.6 — everything in flight, in one reading.
 *
 * Goals, Tasks and Runs each had a page, and somebody who had just asked the
 * team for something needed all three to learn what happened. They are not
 * three things: a goal is why, a task is what, a run is the attempt, and the
 * join between them is what everybody is actually asking for.
 *
 * The first version of this screen gathered them and stopped there — four
 * statistic cards over a stack of identical rows, each row carrying a status
 * pill, a repeat of that same status in words, and a bare timestamp. Gathered,
 * not designed. What follows is the second attempt, and the rules it holds to:
 *
 *   - **No cards for counts.** Four boxes for four numbers took the top third
 *     of the screen to say what one sentence says, and the list below said it
 *     again, better.
 *   - **Hierarchy by rule, not by box.** A hairline down the left groups a
 *     goal's tasks. Panels nested inside panels read as importance, and a task
 *     is not important because it has a parent.
 *   - **One phrase per row, and it has to be worth reading.** Not
 *     "BLOCKED · 1 blocked · 16m ago" but what is blocking it. The state a
 *     reader wants is rarely the enum; it is the consequence.
 */
export function Work() {
  const workspaceId = useSession((state) => state.workspaceId)!;

  const goals = useResource(() => api.goals.list(workspaceId), [workspaceId], {
    pollMs: 15_000,
  });
  const tasks = useResource(() => api.tasks.list(workspaceId), [workspaceId], {
    pollMs: 15_000,
  });
  /** Polled faster than the rest: the run is the part that moves. */
  const runs = useResource(() => api.runs.list(workspaceId), [workspaceId], {
    pollMs: 6_000,
  });

  const allGoals = goals.data ?? [];
  const allTasks = tasks.data ?? [];
  // Memoised rather than defaulted inline: `?? []` is a new array every
  // render, which would rebuild the map below whether or not a run changed.
  const allRuns = useMemo(() => runs.data ?? [], [runs.data]);

  /**
   * The newest run per task — the only one that answers "what now". Earlier
   * attempts belong to the run screen, where the question is different.
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
   * goal is usually a mistake, and dropping it from the one screen that lists
   * work is how it stays lost.
   */
  const loose = allTasks.filter(
    (task) => !task.goalId || !allGoals.some((goal) => goal.id === task.goalId),
  );

  const running = allRuns.filter((run) => run.status === "RUNNING").length;
  const open = allTasks.filter(
    (task) => task.status !== "DONE" && task.status !== "CANCELLED",
  ).length;
  const ready = allTasks.filter((task) => task.status === "READY").length;

  const loading = goals.loading || tasks.loading;
  const error = goals.error ?? tasks.error;

  return (
    /**
     * Bounded to a reading measure rather than the shell's full width.
     *
     * This is a list somebody reads down, not a table they compare across.
     * At the shell's 72rem a short task title left the state word a thousand
     * pixels away on the right, and pairing the two took a deliberate eye
     * movement per row. Narrower is not smaller here — it is legible.
     */
    <div className="max-w-4xl">
      <PageHeader
        title="Work"
        lead={
          loading ? undefined : (
            <Summary open={open} goals={allGoals.length} running={running} />
          )
        }
        actions={<NewGoal trigger={<AddButton>State a goal</AddButton>} />}
      />

      <Automation workspaceId={workspaceId} ready={ready} />

      {loading ? <Loading rows={4} /> : null}
      {error ? <Note>{error}</Note> : null}

      {!loading && allGoals.length === 0 && loose.length === 0 ? (
        <Empty icon={Target} title="Nothing under way">
          State a goal and cut it into tasks — or open a conversation and ask
          the manager to, which is the same thing with fewer clicks.
        </Empty>
      ) : null}

      {/* Goals breathe; the tasks inside one stay tight against it. */}
      <div className="space-y-10">
        {allGoals.map((goal) => (
          <Goal
            key={goal.id}
            goal={goal}
            tasks={tasksOf(goal.id)}
            latestRun={latestRun}
          />
        ))}

        {loose.length > 0 ? (
          <section>
            <h2 className="text-muted-foreground mb-3 text-sm">Not under any goal</h2>
            <Tasks tasks={loose} latestRun={latestRun} />
          </section>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The whole state of the workspace in one sentence.
 *
 * This replaced four statistic cards. They were not wrong, they were
 * disproportionate: a number nobody acts on does not deserve a box, and the
 * one that does change a reader's next move — is anything running — reads
 * better as a clause than as a large zero.
 */
function Summary({
  open,
  goals,
  running,
}: {
  open: number;
  goals: number;
  running: number;
}) {
  if (open === 0 && goals === 0) {
    return <>Nothing stated yet.</>;
  }
  return (
    <>
      {open} open {open === 1 ? "task" : "tasks"} under {goals}{" "}
      {goals === 1 ? "goal" : "goals"}.{" "}
      {running > 0 ? (
        <span className={TONE_TEXT.live}>{running} running now.</span>
      ) : (
        <span>Nothing running.</span>
      )}
    </>
  );
}

/**
 * A goal and its tasks, grouped by a rule rather than a frame.
 *
 * The hairline down the left does the containment a nested card used to do,
 * at a fraction of the weight — which matters because the screen shows
 * several goals at once, and boxes inside boxes read as a filing cabinet.
 */
function Goal({
  goal,
  tasks,
  latestRun,
}: {
  goal: GoalView;
  tasks: TaskView[];
  latestRun: Map<string, RunView>;
}) {
  const live = tasks.some((task) => latestRun.get(task.id)?.status === "RUNNING");
  const done = tasks.filter((task) => task.status === "DONE").length;
  const share = Math.max(0, Math.min(100, goal.progress));

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-6">
        <h2 className="min-w-0 text-base font-medium">
          <Link
            href={routes.goal(goal.id)}
            className="hover:decoration-muted-foreground underline decoration-transparent underline-offset-4 transition-colors"
          >
            {goal.title}
          </Link>
          {live ? (
            <span className={`ml-3 text-xs font-normal ${TONE_TEXT.live}`}>
              <span className="bg-live mr-1.5 inline-block size-1.5 animate-pulse rounded-full align-middle" />
              working
            </span>
          ) : null}
        </h2>

        {/*
         * The bar and its count travel together on the right, so the eye finds
         * progress in the same place on every goal instead of chasing it
         * across titles of different lengths.
         */}
        <div className="text-muted-foreground flex shrink-0 items-center gap-3 text-xs">
          {/* No bar when there is nothing to measure: an empty track reads as
              zero progress, which is a different claim from "not started". */}
          {tasks.length > 0 ? (
            <span className="bg-border h-0.75 w-24 overflow-hidden rounded-full">
              <span
                className={`block h-full rounded-full ${share >= 100 ? "bg-settled" : "bg-live"}`}
                style={{ width: `${share}%` }}
              />
            </span>
          ) : null}
          <span className="measure text-right">
            {tasks.length > 0 ? `${done}/${tasks.length} done` : "no task yet"}
          </span>
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="text-muted-foreground border-border/70 border-l pl-4 text-sm">
          Stated, but nobody has cut it into tasks yet.
        </p>
      ) : (
        <Tasks tasks={tasks} latestRun={latestRun} />
      )}
    </section>
  );
}

function Tasks({
  tasks,
  latestRun,
}: {
  tasks: TaskView[];
  latestRun: Map<string, RunView>;
}) {
  return (
    <ul className="border-border/70 border-l">
      {tasks.map((task) => (
        <Task key={task.id} task={task} run={latestRun.get(task.id)} />
      ))}
    </ul>
  );
}

/**
 * One task, and the single most useful thing that can be said about it.
 *
 * The row this replaces carried a coloured pill saying BLOCKED, the words "1
 * blocked" beside it, and a timestamp — three elements, one fact, and the
 * fact a reader actually needs (blocked BY WHAT) nowhere on the line. Now the
 * tone lives in the dot, the word and its consequence live in one phrase on
 * the right, and nothing is said twice.
 */
function Task({ task, run }: { task: TaskView; run: RunView | undefined }) {
  const running = run?.status === "RUNNING";
  const tone = toneOf(task.status);
  const state = stateOf(task, run);

  return (
    <li className="border-border/50 border-b last:border-b-0">
      <Link
        href={routes.task(task.id)}
        className="hover:bg-muted/40 block py-2.5 pr-3 pl-4 transition-colors"
      >
        <span className="flex items-baseline gap-4">
          <span
            className={`mt-[0.4rem] size-1.5 shrink-0 rounded-full ${
              running ? "bg-live animate-pulse" : DOT[tone]
            }`}
          />
          <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
          {/*
           * Short, aligned, scannable — the column somebody runs their eye
           * down. The long half of the answer goes below rather than being
           * truncated against the right edge, which is what the first fix did
           * to the one sentence a reader most needs.
           */}
          <span className={`shrink-0 text-xs ${state.tone}`}>{state.word}</span>
        </span>

        {state.detail ? (
          <span className="text-muted-foreground mt-1 block max-w-prose pl-6.5 text-xs">
            {state.detail}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/** Tone → the dot that carries it. The word always travels beside it. */
const DOT: Record<string, string> = {
  signal: "bg-signal",
  waiting: "bg-waiting",
  live: "bg-live",
  settled: "bg-settled",
  quiet: "bg-muted-foreground/40",
};

/**
 * What is true of this task right now: a word to scan, and the sentence
 * behind it when there is one.
 *
 * Split in two on purpose. The row this replaces carried a coloured pill
 * saying BLOCKED, the words "1 blocked" beside it, and a timestamp — three
 * elements, one fact, and the fact a reader actually needs (blocked BY WHAT)
 * nowhere on the line. Then the fix put the blocker on the right, and the
 * right edge ate it. A word aligns and scans; a sentence needs room. They are
 * different jobs, so they get different places.
 *
 * Ordered by what somebody would act on first, and a blocker outranks a
 * status: "blocked" says there is a problem, the blocker's own words say
 * whether it is theirs to solve.
 */
function stateOf(
  task: TaskView,
  run: RunView | undefined,
): { word: string; tone: string; detail?: string } {
  const [blocker] = task.blockers;
  if (task.openBlockerCount > 0 && blocker) {
    return { word: "blocked", tone: TONE_TEXT.signal, detail: blocker.description };
  }

  if (run?.status === "RUNNING") {
    /**
     * §17 — the last thing the agent said or reached for. This is what turns
     * a spinner into information, and the run already carries it.
     */
    const doing = run.attempts.at(-1)?.trace?.at(-1)?.text;
    return {
      word: `running ${run.startedAt ? since(run.startedAt) : ""}`.trim(),
      tone: TONE_TEXT.live,
      ...(doing ? { detail: doing } : {}),
    };
  }

  if (task.status === "DONE") {
    return {
      word: `done ${run?.finishedAt ? since(run.finishedAt) : ""}`.trim(),
      tone: TONE_TEXT.settled,
    };
  }

  if (task.status === "IN_REVIEW" || run?.status === "VALIDATING") {
    return { word: "awaiting proof", tone: TONE_TEXT.waiting };
  }

  if (task.status === "READY") {
    return {
      word: run ? "ready again" : "waiting for a machine",
      tone: "text-muted-foreground",
    };
  }

  return {
    word: task.status.replace(/_/g, " ").toLowerCase(),
    tone: "text-muted-foreground",
  };
}

/**
 * §9 — said here because here is where its absence is felt.
 *
 * Nothing is duplicated: the ceiling and its numbers stay on Governance,
 * where a rule the hub enforces belongs. What lives here is the sentence that
 * closes the gap between a queue full of ready tasks and a workspace where
 * nothing runs — as a quiet line rather than the wide filled bar it started
 * as, because it is an explanation, not an alarm.
 */
function Automation({ workspaceId, ready }: { workspaceId: string; ready: number }) {
  const workspace = useResource(() => api.workspaces.get(workspaceId), [workspaceId]);
  const { run, pending } = useAction();

  const bag = (workspace.data?.settings ?? {}) as Record<string, unknown>;
  const current = (
    typeof bag.automation === "object" && bag.automation !== null ? bag.automation : {}
  ) as Record<string, unknown>;

  // Nothing to say when it is on, or before we know: a banner that is always
  // there is a banner nobody reads.
  if (!workspace.data || current.automatic === true) {
    return null;
  }

  return (
    <p className="border-waiting/40 text-muted-foreground mb-8 flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 py-1 pl-4 text-sm">
      <span>
        {ready > 0
          ? `${ready} ${ready === 1 ? "task is" : "tasks are"} ready and nothing will pick ${ready === 1 ? "it" : "them"} up.`
          : "This workspace does not start work on its own."}{" "}
        Each one has to be dispatched by hand.
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
    </p>
  );
}
