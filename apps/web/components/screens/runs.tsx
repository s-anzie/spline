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
                <p className="truncate text-sm font-medium">
                  {run.attempts.at(-1)?.provider ?? "not started"}
                  {run.attempts.at(-1)?.model ? (
                    <span className="measure text-muted-foreground ml-2 text-xs font-normal">
                      {run.attempts.at(-1)?.model}
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  task <span className="measure">{run.taskId.slice(0, 8)}</span> ·{" "}
                  {run.attempts.length} attempt{run.attempts.length === 1 ? "" : "s"}
                  {run.failureReason ? (
                    <span className="text-signal"> · {run.failureReason}</span>
                  ) : null}
                </p>
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

  const elapsed =
    view.startedAt && view.finishedAt
      ? new Date(view.finishedAt).getTime() - new Date(view.startedAt).getTime()
      : null;

  return (
    <>
      <BackTo label="Runs" href={routes.runs} />
      <PageHeader
        title={`Run #${view.attemptNumber}`}
        lead={
          view.failureReason ??
          "One order to execute a task, and every attempt made against it."
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

      <StatRow>
        <Stat
          label="Spent"
          value={money(spent(view))}
          icon={CircleDollarSign}
          tone="waiting"
          hint={`over ${view.attempts.length} attempt${view.attempts.length === 1 ? "" : "s"}`}
        />
        <Stat
          label="Wall clock"
          value={duration(elapsed)}
          icon={Play}
          hint={view.finishedAt ? "start to finish" : "still running"}
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
        <Stat
          label="Attempts"
          value={view.attempts.length}
          icon={RotateCcw}
          tone={view.attempts.length > 1 ? "waiting" : "quiet"}
          hint={view.attempts.length > 1 ? "it needed more than one" : "first time"}
        />
      </StatRow>

      <div className="mb-7 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Section title="Attempts" count={view.attempts.length}>
          {view.attempts.length === 0 ? (
            <Empty icon={Play} title="No attempt yet">
              This run was opened but no machine has begun. It is waiting on a
              worker to claim its command.
            </Empty>
          ) : (
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
                    <TableHead className="label">session</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.attempts.map((attempt) => (
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
                      <TableCell className="measure text-right">
                        {money(attempt.cost)}
                      </TableCell>
                      <TableCell className="measure text-right">
                        {duration(attempt.durationMs)}
                      </TableCell>
                      <TableCell>
                        <Status value={attempt.outcome} />
                      </TableCell>
                      {/* §4.8 — what a resume would resume. Shown because it
                          is the difference between continuing and starting
                          over. */}
                      <TableCell>
                        <Id value={attempt.providerSessionId} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </Section>

        <Trace attempts={view.attempts} />

        <Card className="h-fit gap-0 p-4 shadow-none">
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
    </>
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
  const trace = latest?.trace ?? [];

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
    <Section title="What it did" count={trace.length}>
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <div className="divide-border/60 max-h-[28rem] divide-y overflow-y-auto">
          {trace.map((entry, at) => (
            <div
              key={`${entry.at}-${at}`}
              className="flex items-start gap-3 px-4 py-2.5"
            >
              <span
                aria-hidden
                className="mt-1 w-0.5 shrink-0 self-stretch rounded-full"
                style={{
                  background:
                    entry.kind === "used"
                      ? "var(--live)"
                      : entry.kind === "result"
                        ? "var(--settled)"
                        : "var(--muted-foreground)",
                }}
              />
              <span className="label text-muted-foreground w-14 shrink-0 pt-0.5">
                {entry.kind === "used" ? "tool" : entry.kind === "result" ? "end" : "said"}
              </span>
              <span
                className={
                  entry.kind === "used"
                    ? "measure min-w-0 flex-1 text-xs leading-relaxed"
                    : "min-w-0 flex-1 text-sm leading-relaxed"
                }
              >
                {entry.text}
              </span>
              <span
                className="measure text-muted-foreground/60 shrink-0 text-[0.6875rem]"
                title={stamp(entry.at)}
              >
                {entry.at.slice(11, 19)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </Section>
  );
}
