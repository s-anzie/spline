"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CircleCheck,
  ClipboardList,
  ListChecks,
  OctagonAlert,
  Play,
  Rocket,
  ShieldCheck,
} from "lucide-react";

import { api, type TaskView } from "@/lib/api";
import { humanise, money, since, stamp } from "@/lib/format";
import { usePaged } from "@/lib/paging";
import { routes } from "@/lib/routes";
import { useSession } from "@/lib/store";
import { toneOf } from "@/lib/tone";
import { useAction, useResource } from "@/lib/use-hub";
import {
  BackTo,
  Empty,
  Facts,
  Field,
  Id,
  Loading,
  Note,
  PageHeader,
  Pager,
  Panel,
  Row,
  Section,
  Segmented,
  Stat,
  StatRow,
  Status,
  Stripe,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** The hub's own task vocabulary, in the order work moves through it. */
const FILTERS = [
  { value: "", label: "All" },
  { value: "READY", label: "Ready" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "RUNNING", label: "Running" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "VALIDATING", label: "Validating" },
  { value: "COMPLETED", label: "Done" },
];

export function TaskList() {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const [status, setStatus] = useState("");
  const tasks = useResource(() => api.tasks.list(workspaceId), [workspaceId], {
    pollMs: 20_000,
  });

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of tasks.data ?? []) {
      map.set(task.status, (map.get(task.status) ?? 0) + 1);
    }
    return map;
  }, [tasks.data]);

  const shown = (tasks.data ?? []).filter((task) => !status || task.status === status);
  const paged = usePaged(shown);
  const blocked = counts.get("BLOCKED") ?? 0;

  return (
    <>
      <PageHeader
        title="Tasks"
        lead="The unit of work an agent is given. A task carries its own acceptance criteria, so what counts as finished is written down before anything runs."
      />

      <StatRow>
        <Stat label="All tasks" value={tasks.data?.length ?? 0} icon={ListChecks} />
        <Stat
          label="Running"
          value={counts.get("RUNNING") ?? 0}
          icon={Play}
          tone="live"
          hint="an agent has it right now"
        />
        <Stat
          label="Blocked"
          value={blocked}
          icon={OctagonAlert}
          tone="signal"
          hint={blocked ? "waiting on a person" : "nothing is stuck"}
        />
        <Stat
          label="Validating"
          value={counts.get("VALIDATING") ?? 0}
          icon={ShieldCheck}
          tone="waiting"
          hint="submitted, awaiting a verdict"
        />
      </StatRow>

      <div className="mb-4">
        <Segmented
          value={status}
          onChange={setStatus}
          options={FILTERS.map((filter) => ({
            ...filter,
            count: filter.value ? counts.get(filter.value) : tasks.data?.length,
          }))}
        />
      </div>

      {tasks.loading ? <Loading rows={5} /> : null}
      {tasks.error ? <Note>{tasks.error}</Note> : null}
      {tasks.data && shown.length === 0 ? (
        <Empty icon={ClipboardList} title={status ? "Nothing here" : "No tasks yet"}>
          {status
            ? `No task is ${humanise(status)} right now.`
            : "A goal is broken into tasks, and a task is what gets handed to a machine."}
        </Empty>
      ) : null}

      {shown.length > 0 ? (
        <>
        <Panel>
          {paged.items.map((task) => (
            <Row key={task.id} href={routes.task(task.id)} className="py-3">
              <Stripe tone={toneOf(task.status)} live={task.status === "RUNNING"} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{task.title}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {task.assignee.type.toLowerCase()}{" "}
                  <span className="measure">{task.assignee.id.slice(0, 8)}</span>
                  {task.openBlockerCount > 0 ? (
                    <span className="text-signal">
                      {" "}
                      · {task.openBlockerCount} open blocker
                      {task.openBlockerCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </p>
              </div>
              <span className="label hidden w-16 shrink-0 md:block">
                {humanise(task.priority)}
              </span>
              <Status value={task.status} />
              <span className="measure text-muted-foreground w-16 shrink-0 text-right text-xs">
                {since(task.updatedAt)}
              </span>
            </Row>
          ))}
        </Panel>
        <Pager paged={paged} />
        </>
      ) : null}
    </>
  );
}

export function TaskDetail({ taskId }: { taskId: string }) {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const task = useResource(() => api.tasks.get(workspaceId, taskId), [workspaceId, taskId]);
  const runs = useResource(
    () => api.runs.list(workspaceId, { taskId }),
    [workspaceId, taskId],
  );
  const { run: act, pending, error } = useAction();

  if (task.loading) return <Loading rows={4} />;
  if (task.error || !task.data) return <Note>{task.error ?? "Not found"}</Note>;
  const view: TaskView = task.data;

  const reload = () => {
    task.reload();
    runs.reload();
  };

  return (
    <>
      <BackTo label="Tasks" href={routes.tasks} />
      <PageHeader
        title={view.title}
        lead={view.description ?? undefined}
        actions={<Status value={view.status} />}
      />

      {/* §20.6 — the hub says which moves exist; the screen offers those. */}
      {view.allowedStatusTargets.length > 0 ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {view.allowedStatusTargets.map((target) => (
            <Button
              key={target}
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                void act(() => api.tasks.setStatus(workspaceId, view.id, target), reload)
              }
            >
              {humanise(target)}
            </Button>
          ))}
        </div>
      ) : null}
      {error ? (
        <div className="mb-6">
          <Note>{error}</Note>
        </div>
      ) : null}

      <div className="mb-7 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Section title="Done means">
          {view.acceptanceCriteria.length > 0 ? (
            <Card className="gap-0 p-5 shadow-none">
              <ol className="space-y-2.5">
                {view.acceptanceCriteria.map((criterion, index) => (
                  <li key={index} className="flex gap-3 text-sm leading-relaxed">
                    <span className="measure text-muted-foreground pt-0.5 text-xs">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{criterion}</span>
                  </li>
                ))}
              </ol>
            </Card>
          ) : (
            <Empty icon={CircleCheck} title="No acceptance criteria">
              Nothing prevents this task from running — but nobody can say
              whether it succeeded.
            </Empty>
          )}
        </Section>

        <Card className="h-fit gap-0 p-4 shadow-none">
          <Facts
            items={[
              ["id", <Id key="id" value={view.id} />],
              [
                "assignee",
                `${view.assignee.type.toLowerCase()} ${view.assignee.id.slice(0, 8)}`,
              ],
              ["priority", humanise(view.priority)],
              [
                "goal",
                view.goalId ? (
                  <Link
                    href={routes.goal(view.goalId)}
                    className="underline underline-offset-2"
                  >
                    {view.goalId.slice(0, 8)}
                  </Link>
                ) : (
                  "—"
                ),
              ],
              ["estimated", money(view.estimatedCost)],
              ["created", stamp(view.createdAt).slice(0, 16)],
              ["updated", since(view.updatedAt)],
            ]}
          />
        </Card>
      </div>

      <Blockers task={view} workspaceId={workspaceId} onDone={reload} />
      <Dispatch task={view} workspaceId={workspaceId} onDone={reload} />

      <Section title="Runs" count={runs.data?.length}>
        {runs.data && runs.data.length > 0 ? (
          <Panel>
            {runs.data.map((entry) => (
              <Row key={entry.runId} href={routes.run(entry.runId)}>
                <Stripe tone={toneOf(entry.status)} live={entry.status === "RUNNING"} />
                <span className="measure text-muted-foreground text-xs">
                  #{entry.attemptNumber}
                </span>
                <span className="flex-1 text-sm">
                  {entry.attempts.map((attempt) => attempt.provider).join(", ") ||
                    "no attempt yet"}
                </span>
                <Status value={entry.status} />
                <span className="measure text-muted-foreground w-16 text-right text-xs">
                  {since(entry.startedAt)}
                </span>
              </Row>
            ))}
          </Panel>
        ) : (
          <Empty icon={Play}>This task has never run.</Empty>
        )}
      </Section>
    </>
  );
}

function Blockers({
  task,
  workspaceId,
  onDone,
}: {
  task: TaskView;
  workspaceId: string;
  onDone: () => void;
}) {
  const open = task.blockers.filter((blocker) => blocker.resolvedAt === null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const { run, pending, error } = useAction();

  if (task.blockers.length === 0) return null;

  return (
    <Section title="Blockers" count={open.length}>
      <Panel>
        {task.blockers.map((blocker) => (
          <div key={blocker.id} className="flex items-stretch gap-3 px-4 py-3.5">
            <Stripe tone={blocker.resolvedAt ? "settled" : "signal"} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2.5">
                <span className="label shrink-0">{humanise(blocker.type)}</span>
                <p className="flex-1 text-sm">{blocker.description}</p>
                <span className="measure text-muted-foreground shrink-0 text-xs">
                  {since(blocker.reportedAt)}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                reported by {blocker.reportedBy.type.toLowerCase()}{" "}
                <span className="measure">{blocker.reportedBy.id.slice(0, 8)}</span>
                {blocker.resolvedAt
                  ? ` · resolved ${since(blocker.resolvedAt)}: ${blocker.resolution ?? ""}`
                  : ""}
              </p>

              {blocker.resolvedAt === null ? (
                resolving === blocker.id ? (
                  <form
                    className="bg-muted/60 mt-3 max-w-md space-y-3 rounded-lg p-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(
                        () =>
                          api.tasks.resolveBlocker(
                            workspaceId,
                            task.id,
                            blocker.id,
                            resolution,
                          ),
                        () => {
                          setResolving(null);
                          setResolution("");
                          onDone();
                        },
                      );
                    }}
                  >
                    <Field
                      label="What unblocked it"
                      value={resolution}
                      onChange={setResolution}
                      placeholder="Granted the credential it asked for"
                      autoFocus
                    />
                    {error ? <Note>{error}</Note> : null}
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={pending || resolution.trim().length === 0}
                      >
                        {pending ? "Recording…" : "Resolve"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setResolving(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2.5"
                    onClick={() => setResolving(blocker.id)}
                  >
                    Resolve
                  </Button>
                )
              ) : null}
            </div>
          </div>
        ))}
      </Panel>
    </Section>
  );
}

/**
 * §6.8 — handing a task to a machine.
 *
 * The hub decides which machine when none is named, and refuses when no
 * machine can do the job rather than queueing an order nobody will claim. The
 * provider list carries its own availability, so one that is out of quota is
 * shown as unavailable instead of failing at dispatch.
 */
function Dispatch({
  task,
  workspaceId,
  onDone,
}: {
  task: TaskView;
  workspaceId: string;
  onDone: () => void;
}) {
  const providers = useResource(() => api.runtime.providers(), []);
  const workers = useResource(() => api.runtime.workers(workspaceId), [workspaceId]);
  const [provider, setProvider] = useState("");
  const [workerId, setWorkerId] = useState("");
  const { run, pending, error } = useAction();

  const usable = (providers.data ?? []).filter((entry) => entry.effectiveAvailable);
  const attached = (workers.data ?? []).filter((worker) => !worker.stale);

  return (
    <Section title="Hand it to a machine">
      <Card className="gap-0 p-4 shadow-none">
        {usable.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No provider is available right now. One that has hit its quota comes
            back on its own — the hub records until when.
          </p>
        ) : attached.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No machine is reporting to this workspace. Pair one from{" "}
            <span className="text-foreground font-medium">Machines</span> first.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-5">
              <div>
                <p className="label mb-1.5">Provider</p>
                <Segmented
                  value={provider}
                  onChange={setProvider}
                  options={usable.map((entry) => ({
                    value: entry.provider,
                    label: entry.provider,
                  }))}
                />
              </div>
              <div>
                <p className="label mb-1.5">Machine</p>
                <Segmented
                  value={workerId}
                  onChange={setWorkerId}
                  options={[
                    { value: "", label: "Hub decides" },
                    ...attached.map((worker) => ({
                      value: worker.id,
                      label: worker.hostname,
                    })),
                  ]}
                />
              </div>
              <Button
                size="sm"
                disabled={pending || !provider}
                onClick={() =>
                  void run(
                    () =>
                      api.runtime.dispatch(workspaceId, {
                        taskId: task.id,
                        provider,
                        ...(workerId ? { workerId } : {}),
                      }),
                    onDone,
                  )
                }
              >
                <Rocket />
                {pending ? "Dispatching…" : "Dispatch"}
              </Button>
            </div>
            {error ? (
              <div className="mt-3">
                <Note>{error}</Note>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </Section>
  );
}
