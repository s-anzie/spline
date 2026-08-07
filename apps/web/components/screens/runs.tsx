"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CircleDollarSign,
  Play,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { api, type RunView } from "@/lib/api";
import { duration, humanise, money, since, stamp, tokens } from "@/lib/format";
import { usePaged } from "@/lib/paging";
import { readable } from "@/lib/activity";
import { routes } from "@/lib/routes";
import { useSession } from "@/lib/store";
import { toneOf } from "@/lib/tone";
import { useAction, useResource } from "@/lib/use-hub";
import {
  BackTo,
  Empty,
  Facts,
  Id,
  Loading,
  Note,
  PageHeader,
  Pager,
  Panel,
  Row,
  Section,
  Stat,
  StatRow,
  Status,
  Stripe,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const spent = (run: RunView) =>
  run.attempts.reduce((total, attempt) => total + (attempt.cost ?? 0), 0);

/**
 * The cap the hub is asked for. Handed to the pager, so a full page says the
 * record continues past it rather than implying this is all there ever was.
 */
const CAP = 100;

export function RunList() {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const runs = useResource(() => api.runs.list(workspaceId, { limit: CAP }), [workspaceId], {
    pollMs: 10_000,
  });

  const all = runs.data ?? [];
  const paged = usePaged(all);
  /**
   * The titles, fetched alongside. A run knows only its task's id, and an id
   * is not what anybody is looking for.
   */
  const tasks = useResource(() => api.tasks.list(workspaceId), [workspaceId], {
    pollMs: 30_000,
  });
  const titleOf = (taskId: string) =>
    (tasks.data ?? []).find((task) => task.id === taskId)?.title;
  const running = all.filter((run) => run.status === "RUNNING").length;
  const failed = all.filter((run) => run.status === "FAILED").length;
  const total = all.reduce((sum, run) => sum + spent(run), 0);

  return (
    <>
      <PageHeader
        title="Runs"
        lead="Every execution this workspace has ordered, and what it cost. A run holds its attempts — a retry is another attempt on the same run, not a new story."
        actions={
          <Button variant="outline" size="sm" onClick={runs.reload} disabled={runs.refreshing}>
            <RefreshCw className={runs.refreshing ? "animate-spin" : undefined} />
            Refresh
          </Button>
        }
      />

      <StatRow>
        <Stat label="Runs" value={all.length} icon={Play} hint="most recent 100" />
        <Stat
          label="Executing"
          value={running}
          icon={Play}
          tone="live"
          hint={running ? "on a machine right now" : "nothing is running"}
        />
        <Stat
          label="Failed"
          value={failed}
          icon={TriangleAlert}
          tone="signal"
          hint={failed ? "each one can be retried" : "none failed"}
        />
        <Stat
          label="Spent"
          value={money(total)}
          icon={CircleDollarSign}
          tone="waiting"
          hint="across every attempt shown"
        />
      </StatRow>

      {runs.loading ? <Loading rows={5} /> : null}
      {runs.error ? <Note>{runs.error}</Note> : null}
      {runs.data && all.length === 0 ? (
        <Empty icon={Play} title="Nothing has executed yet">
          A run appears the moment a task is handed to a machine.
        </Empty>
      ) : null}

      {all.length > 0 ? (
        <>
        <Panel>
          {paged.items.map((run) => (
            <Row key={run.runId} href={routes.run(run.runId)} className="py-3">
              <Stripe tone={toneOf(run.status)} live={run.status === "RUNNING"} />
              <div className="min-w-0 flex-1">
                {/**
                 * The TASK, not the provider.
                 *
                 * Every row here used to be titled "claude", because that is
                 * what the attempt records — so a screen of seven runs was a
                 * column of the same word seven times, and the only thing
                 * distinguishing them was eight characters of task id in the
                 * line below. What somebody scanning this wants is which
                 * piece of work it was.
                 */}
                <p className="truncate text-sm font-medium">
                  {titleOf(run.taskId) ?? `task ${run.taskId.slice(0, 8)}`}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {run.attempts.at(-1)?.provider ?? "not started yet"}
                  {run.attempts.at(-1)?.model ? ` · ${run.attempts.at(-1)?.model}` : ""} ·{" "}
                  {run.attempts.length} attempt{run.attempts.length === 1 ? "" : "s"}
                </p>
                {/**
                 * On its own line and clamped. Three of these paragraphs in a
                 * list turned the screen into a wall of the same red sentence
                 * repeated; the whole of it is one click away on the run.
                 */}
                {run.failureReason ? (
                  <p className="text-signal mt-0.5 truncate text-xs" title={run.failureReason}>
                    {run.failureReason}
                  </p>
                ) : null}
              </div>
              <span className="measure w-20 shrink-0 text-right text-sm">
                {money(spent(run))}
              </span>
              <Status value={run.status} />
              <span className="measure text-muted-foreground w-16 shrink-0 text-right text-xs">
                {since(run.startedAt)}
              </span>
            </Row>
          ))}
        </Panel>
        <Pager paged={paged} cap={CAP} />
        </>
      ) : null}
    </>
  );
}

export function RunDetail({ runId }: { runId: string }) {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const router = useRouter();
  const run = useResource(() => api.runs.get(workspaceId, runId), [workspaceId, runId], {
    pollMs: 8_000,
  });
  const { run: act, pending, error } = useAction();

  if (run.loading) return <Loading rows={4} />;
  if (run.error || !run.data) return <Note>{run.error ?? "Not found"}</Note>;
  const view = run.data;

  /**
   * How long the WORK took, not how long the row existed.
   *
   * This screen said "wall clock 16h 36m — start to finish" about a run whose
   * only attempt took 54 seconds. Both numbers were true and the big one was
   * a lie in effect: `finishedAt` is set when the verdict lands, so what was
   * labelled "start to finish" was mostly a run sitting overnight waiting for
   * somebody to press a button. The number a reader is looking for is the
   * work.
   */
  const worked = view.attempts.reduce(
    (total, attempt) => total + (attempt.durationMs ?? 0),
    0,
  );
  const alive =
    view.startedAt && view.finishedAt
      ? new Date(view.finishedAt).getTime() - new Date(view.startedAt).getTime()
      : null;
  /** The gap between finishing the work and somebody deciding about it. */
  const waited = alive !== null && worked > 0 ? Math.max(0, alive - worked) : null;
  const latest = view.attempts.at(-1);

  return (
    /**
     * A frame the height of the console's content area, with only the story
     * scrolling inside it. The page used to scroll as a whole, so reading
     * what an agent did took the header, the numbers and the breadcrumb off
     * the screen — and a run of thirty steps left nothing on screen saying
     * which run it was.
     *
     * `min-h-0` on the scrolling child is what makes that true in a flex
     * column: without it the child grows to fit its content and the page
     * scrolls after all.
     */
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="shrink-0">
      <BackTo label="Runs" href={routes.runs} />
      <PageHeader
        title={`Run #${view.attemptNumber}`}
        lead={
          view.failureReason ?? (
            <>
              {latest?.provider ?? "no machine has taken this yet"}
              {latest?.model ? ` · ${latest.model}` : ""} ·{" "}
              {view.attempts.length} attempt{view.attempts.length === 1 ? "" : "s"} ·{" "}
              <Link
                href={routes.task(view.taskId)}
                className="underline underline-offset-2"
              >
                the task
              </Link>
            </>
          )
        }
        actions={
          <>
            <Status value={view.status} />
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                void act(() => api.runs.retry(workspaceId, view.taskId), () =>
                  router.push(routes.runs),
                )
              }
            >
              <RotateCcw />
              {pending ? "Starting…" : "Retry the task"}
            </Button>
          </>
        }
      />

      {error ? (
        <div className="mb-6">
          <Note>{error}</Note>
        </div>
      ) : null}

      {/**
       * Three numbers, and each one earns its place. "Attempts" was a fourth
       * card reading 1 over the words "first time", which is a box spent on
       * something the sentence above already says.
       */}
      <StatRow>
        <Stat
          label="Spent"
          value={money(spent(view))}
          icon={CircleDollarSign}
          tone="waiting"
          hint={`over ${view.attempts.length} attempt${view.attempts.length === 1 ? "" : "s"}`}
        />
        <Stat
          label="Worked"
          value={worked > 0 ? duration(worked) : "—"}
          icon={Play}
          hint={
            waited !== null && waited > 60_000
              ? `then waited ${duration(waited)} for a verdict`
              : view.finishedAt
                ? "agent time, start to finish"
                : "still going"
          }
        />
        <Stat
          label="Tokens"
          value={tokens(
            view.attempts.reduce<Record<string, number>>((sum, attempt) => {
              for (const [key, count] of Object.entries(attempt.tokenUsage ?? {})) {
                sum[key] = (sum[key] ?? 0) + count;
              }
              return sum;
            }, {}),
          )}
          icon={Play}
          hint="every attempt together"
        />
      </StatRow>
      </div>

      {/**
       * The story on the left, where it scrolls; what this run came from on
       * the right, where it does not.
       *
       * The narrative used to sit in the 18rem column and the facts in the
       * wide one — the wrong way round, and with a third child in a
       * two-column grid the facts landed in a second row leaving half the
       * screen empty. The tall thing takes the wide column; the short one
       * takes the narrow, and stays put while the story moves.
       */}
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[1fr_18rem]">
        {/**
         * The heading stays; only the steps move. A title that scrolls away
         * leaves a list of timestamps with nothing saying what they are —
         * which is the same problem as the page scrolling, one level in.
         */}
        <div className="flex min-h-0 flex-col">
          {view.attempts.length > 1 ? (
            <div className="shrink-0">
              <Attempts attempts={view.attempts} />
            </div>
          ) : null}
          <Trace attempts={view.attempts} />
        </div>

        <Card className="h-fit gap-0 p-4 shadow-none">
          <p className="label mb-3">Where this came from</p>
          <Facts
            items={[
              ["run", <Id key="run" value={view.runId} />],
              [
                "task",
                <Link
                  key="task"
                  href={routes.task(view.taskId)}
                  className="underline underline-offset-2"
                >
                  {view.taskId.slice(0, 8)}
                </Link>,
              ],
              ["machine", <Id key="worker" value={view.workerId} />],
              ...(latest?.providerSessionId
                ? ([
                    [
                      "resumable session",
                      <Id key="session" value={latest.providerSessionId} />,
                    ],
                  ] as [string, React.ReactNode][])
                : []),
              ["started", stamp(view.startedAt).slice(0, 16)],
              [
                "finished",
                view.finishedAt ? stamp(view.finishedAt).slice(0, 16) : "still running",
              ],
              [
                "can become",
                view.allowedStatusTargets.length
                  ? view.allowedStatusTargets.map(humanise).join(", ")
                  : "nothing — it is settled",
              ],
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

/**
 * §9.12 — the earlier tries, when there were any.
 *
 * Not shown at all for a single attempt: an eight-column table rendering one
 * row is a table about nothing, and everything in it already sits in the
 * header and the facts below. Several attempts is a different question —
 * "why did the first one fail" — and that is what a comparison is for.
 */
function Attempts({ attempts }: { attempts: RunView["attempts"] }) {
  return (
    <Section title="Attempts" count={attempts.length}>
      <Card className="scroll-x gap-0 overflow-hidden py-0 shadow-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="label">#</TableHead>
              <TableHead className="label">provider</TableHead>
              <TableHead className="label">model</TableHead>
              <TableHead className="label text-right">tokens</TableHead>
              <TableHead className="label text-right">cost</TableHead>
              <TableHead className="label text-right">took</TableHead>
              <TableHead className="label">outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attempts.map((attempt) => (
              <TableRow key={attempt.number}>
                <TableCell className="measure text-muted-foreground">
                  {attempt.number}
                </TableCell>
                <TableCell className="font-medium">{attempt.provider}</TableCell>
                <TableCell className="measure text-muted-foreground text-xs">
                  {attempt.model ?? "—"}
                </TableCell>
                <TableCell className="measure text-right">
                  {tokens(attempt.tokenUsage)}
                </TableCell>
                <TableCell className="measure text-right">{money(attempt.cost)}</TableCell>
                <TableCell className="measure text-right">
                  {duration(attempt.durationMs)}
                </TableCell>
                <TableCell>
                  <Status value={attempt.outcome} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Section>
  );
}

/**
 * §17 — what the agent was doing, rather than only what it cost.
 *
 * A run used to report a number and one final sentence. An operator asking
 * "is it working, and on what?" had nothing to read — the same position as
 * having no agent, minus the money.
 *
 * The newest attempt's trace, because that is the one somebody is looking at.
 * Earlier attempts keep theirs, which is what makes "why did the first one
 * fail" answerable at all.
 */
function Trace({ attempts }: { attempts: RunView["attempts"] }) {
  const latest = attempts.at(-1);
  /**
   * The steps worth reading. `readable` returns null for machinery nobody
   * outside this process needs to see happen — a run that spent three calls
   * looking its own tools up should not spend three lines of its story
   * saying so. Falling back to the raw text let them straight back in.
   */
  const trace = (latest?.trace ?? [])
    .filter((entry) => entry.kind !== "used" || readable(entry.text) !== null)
    /**
     * The closing envelope repeats the last thing said, word for word. Both
     * printed meant every run ended by saying the same paragraph twice — the
     * conversation drops it for the same reason, and a reader comparing the
     * two accounts of one run should not find them disagreeing about how it
     * ended.
     */
    .filter(
      (entry, at, all) =>
        entry.kind !== "result" || all[at - 1]?.text !== entry.text,
    );

  if (trace.length === 0) {
    return (
      <Section title="What it did">
        <Note tone="quiet">
          Nothing was recorded for this attempt. A run started before the
          machine learned to watch its agent has no trace, and one that failed
          before the agent spoke has nothing to show.
        </Note>
      </Section>
    );
  }

  return (
    /**
     * Written out rather than wrapped in `Section`, because this one has to
     * be a flex column: a fixed heading, then a body that takes what is left
     * and scrolls inside it. `Section` is built for a page that scrolls as a
     * whole, which is exactly what this screen stopped doing.
     */
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2.5 flex shrink-0 items-center gap-2">
        <h2 className="label">What it did</h2>
        <span className="measure bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[0.625rem] normal-case">
          {trace.length}
        </span>
      </div>
      <Card className="min-h-0 flex-1 gap-0 overflow-hidden py-0 shadow-none">
        <ul className="divide-border/60 min-h-0 flex-1 divide-y overflow-y-auto">
          {trace.map((entry, at) => {
            const said = entry.kind !== "used";
            /**
             * `readable` turns `mcp__spline__acquire_lock` into "took a lock"
             * and an 84-character temporary path into the file's name — the
             * same translation the conversation uses, so the two accounts of
             * one run do not read as two different systems.
             */
            const text = said ? entry.text : readable(entry.text);
            return (
              <li
                key={`${entry.at}-${at}`}
                className="flex items-baseline gap-4 px-4 py-2.5"
              >
                {/**
                 * The time first and fixed. It used to sit last with nothing
                 * reserving its width, so it overlapped whatever the step
                 * said — `mcp__spline__synchronize` and `45:28` printed on
                 * top of each other.
                 */}
                <span
                  className="measure text-muted-foreground/60 w-14 shrink-0 text-[0.6875rem] tabular-nums"
                  title={stamp(entry.at)}
                >
                  {entry.at.slice(11, 19)}
                </span>
                <span
                  aria-hidden
                  className={`mt-[0.35rem] size-1.5 shrink-0 rounded-full ${
                    said ? "bg-muted-foreground/50" : "bg-live/70"
                  }`}
                />
                <span
                  className={
                    said
                      ? "min-w-0 flex-1 text-sm leading-relaxed"
                      : "text-muted-foreground min-w-0 flex-1 text-sm"
                  }
                >
                  {text}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
