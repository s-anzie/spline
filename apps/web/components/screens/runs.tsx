"use client";

import {
  CircleDollarSign,
  Play,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { api, type RunView } from "@/lib/api";
import { duration, humanise, money, since, stamp, tokens } from "@/lib/format";
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

export function Runs() {
  const { workspaceId, route, go } = useSession();
  if (route.id) {
    return <RunDetail workspaceId={workspaceId!} runId={route.id} onBack={() => go("runs")} />;
  }
  return <RunList workspaceId={workspaceId!} />;
}

function RunList({ workspaceId }: { workspaceId: string }) {
  const go = useSession((state) => state.go);
  const runs = useResource(() => api.runs.list(workspaceId, { limit: 100 }), [workspaceId], {
    pollMs: 10_000,
  });

  const all = runs.data ?? [];
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
        <Panel>
          {all.map((run) => (
            <Row key={run.runId} onOpen={() => go("runs", run.runId)} className="py-3">
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
      ) : null}
    </>
  );
}

function RunDetail({
  workspaceId,
  runId,
  onBack,
}: {
  workspaceId: string;
  runId: string;
  onBack: () => void;
}) {
  const go = useSession((state) => state.go);
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
      <BackTo label="Runs" onBack={onBack} />
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
                void act(() => api.runs.retry(workspaceId, view.taskId), () => go("runs"))
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

        <Card className="h-fit gap-0 p-4 shadow-none">
          <Facts
            items={[
              ["run", <Id key="run" value={view.runId} />],
              [
                "task",
                <button
                  key="task"
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => go("tasks", view.taskId)}
                >
                  {view.taskId.slice(0, 8)}
                </button>,
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
