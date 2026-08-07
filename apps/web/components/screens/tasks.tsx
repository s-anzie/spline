"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CircleCheck,
  ClipboardList,
  ListChecks,
  MessagesSquare,
  OctagonAlert,
  Play,
  Rocket,
  ShieldCheck,
} from "lucide-react";

import { api, type TaskView, type ThreadView } from "@/lib/api";
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
  Picker,
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
import { AddButton, NewGoal } from "@/components/forms";

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
        actions={<NewGoal trigger={<AddButton>State a need</AddButton>} />}
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
            : "A task always belongs to a goal — state the need first, then break it down."}
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
  // §10.18a — the threads that delegated THIS task. The hub has no route
  // that filters by task, and it does not need one: the caller's own threads
  // are the only ones they may read anyway.
  const threads = useResource(() => api.threads.mine(workspaceId), [workspaceId]);
  const { run: act, pending, error } = useAction();

  if (task.loading) return <Loading rows={4} />;
  if (task.error || !task.data) return <Note>{task.error ?? "Not found"}</Note>;
  const view: TaskView = task.data;

  const reload = () => {
    task.reload();
    runs.reload();
    threads.reload();
  };

  return (
    <>
      <BackTo label="Tasks" href={routes.tasks} />
      <PageHeader
        title={view.title}
        lead={view.description ?? undefined}
        actions={<Status value={view.status} />}
      />

      {/**
       * §20.6 — the hub says which moves exist; the screen offers those.
       *
       * Labelled, because three bare words under a title read as tabs or
       * filters rather than as things that will change the task the moment
       * they are pressed.
       */}
      {view.allowedStatusTargets.length > 0 || view.status === "VALIDATING" ? (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="label text-muted-foreground mr-1">Move it to</span>
          {view.allowedStatusTargets.map((target) => (
            <Button
              key={target}
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                void act(
                  () =>
                    // §11.7 — reaching VALIDATING is a SUBMISSION, not a
                    // status pick. The plain route moves the word and records
                    // no proof, so a workspace that mandates
                    // `required_validations` would approve anything.
                    target === "VALIDATING"
                      ? api.tasks.submit(workspaceId, view.id)
                      : api.tasks.setStatus(workspaceId, view.id, target),
                  reload,
                )
              }
            >
              {target === "VALIDATING" ? "Submit for validation" : humanise(target)}
            </Button>
          ))}
          {/* §4.24, §10.9 — completion is an approval, not a status pick, and
              the affordance list never advertises it. Naming the button after
              what it is keeps that visible instead of hiding it in a menu. */}
          {view.status === "VALIDATING" ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => void act(() => api.tasks.complete(workspaceId, view.id), reload)}
            >
              <CircleCheck />
              Approve as done
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div className="mb-6">
          <Note>{error}</Note>
        </div>
      ) : null}

      <Waiting task={view} workspaceId={workspaceId} onDone={reload} />

      {/**
       * Full width, and the facts moved to the foot of the page.
       *
       * These two lived side by side in a two-column grid, and a grid row is
       * as tall as its tallest cell — so one line of acceptance criteria sat
       * in a panel two hundred pixels tall, held open by a facts card beside
       * it. `items-start` stops the stretching but not the reserving; the
       * only way a short thing stops paying for a tall one is not to put them
       * in the same row.
       */}
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

      <Blockers task={view} workspaceId={workspaceId} onDone={reload} />

      <Dispatch task={view} workspaceId={workspaceId} onDone={reload} />

      <Delegation
        task={view}
        threads={(threads.data ?? []).filter((thread) => thread.taskId === view.id)}
        onDone={reload}
      />

      <Section title="Where this sits">
        <Card className="gap-0 p-4 shadow-none">
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
                    key="goal"
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
      </Section>

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

/**
 * §11 — what this task is waiting on, and the means to end the wait.
 *
 * The screen said nothing at all about proof. A task could sit in VALIDATING
 * for a day with an agent's request outstanding, and the one page devoted to
 * that task did not mention it — so somebody arriving from a queue entry that
 * said "this needs you" found a status word and no verdict to give. Being
 * asked to intervene without being given the means is worse than not being
 * asked.
 *
 * First on the page, above the criteria and the facts, because a task that is
 * waiting on somebody is waiting on the person reading this.
 */
function Waiting({
  task,
  workspaceId,
  onDone,
}: {
  task: TaskView;
  workspaceId: string;
  onDone: () => void;
}) {
  const proof = useResource(
    () => api.validations.list(workspaceId, { taskId: task.id }),
    [workspaceId, task.id],
    { pollMs: 10_000 },
  );
  const outstanding = (proof.data ?? []).filter(
    (entry) => entry.status === "PENDING" || entry.status === "RUNNING",
  );
  const settled = (proof.data ?? []).filter(
    (entry) => entry.status !== "PENDING" && entry.status !== "RUNNING",
  );

  if (outstanding.length === 0 && settled.length === 0) {
    return null;
  }

  return (
    <Section title="Proof" count={proof.data?.length}>
      <Panel>
        {outstanding.map((entry) => (
          <Row key={entry.id} className="py-3">
            <Stripe tone="waiting" />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                {humanise(entry.type)}
                {entry.mandatory ? "" : " (optional)"}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                asked for by {entry.requestedBy.type.toLowerCase()}{" "}
                {entry.requestedBy.id.slice(0, 8)} · {since(entry.createdAt)}
              </p>
            </div>
            <Verdict validationId={entry.id} workspaceId={workspaceId} onDone={onDone} />
          </Row>
        ))}
        {settled.map((entry) => (
          <Row key={entry.id} className="py-3">
            <Stripe tone={entry.satisfied ? "settled" : "signal"} />
            <span className="flex-1 text-sm">{humanise(entry.type)}</span>
            {entry.output ? (
              <span className="text-muted-foreground max-w-md truncate text-xs">
                {entry.output}
              </span>
            ) : null}
            <Status value={entry.status} />
          </Row>
        ))}
      </Panel>
    </Section>
  );
}

/**
 * Pass or send back, in one press — the same two words the queue uses, so
 * the verdict reads the same wherever somebody is standing when they give it.
 */
function Verdict({
  validationId,
  workspaceId,
  onDone,
}: {
  validationId: string;
  workspaceId: string;
  onDone: () => void;
}) {
  const [refusing, setRefusing] = useState(false);
  const [why, setWhy] = useState("");
  const { run, pending, error } = useAction();

  const pronounce = (action: "SUCCEEDED" | "FAILED", output?: string) =>
    void run(async () => {
      const started = await api.validations.settle(workspaceId, validationId, "START");
      // Already RUNNING is somebody having pressed first, or this very click
      // retried. Only a server fault is worth stopping for.
      if (!started.ok && started.error.status >= 500) {
        return started;
      }
      return api.validations.settle(workspaceId, validationId, action, output);
    }, onDone);

  if (refusing) {
    return (
      <div className="flex flex-1 flex-wrap items-end gap-2">
        <Field
          label="Why"
          value={why}
          onChange={setWhy}
          placeholder="What is wrong with it?"
          className="max-w-md flex-1"
        />
        <Button
          size="sm"
          variant="destructive"
          disabled={pending || !why.trim()}
          onClick={() => pronounce("FAILED", why.trim())}
        >
          {pending ? "Sending…" : "Send it back"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRefusing(false)}>
          Cancel
        </Button>
        {error ? <Note>{error}</Note> : null}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button size="sm" disabled={pending} onClick={() => pronounce("SUCCEEDED")}>
        <CircleCheck />
        {pending ? "Approving…" : "It passes"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setRefusing(true)}>
        Send it back
      </Button>
      {error ? <Note>{error}</Note> : null}
    </div>
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
  /**
   * Machines that are here but quiet, told apart from none at all.
   *
   * This screen said "No machine is reporting to this workspace. Pair one
   * from Machines first." to somebody whose machine was paired, attached and
   * simply between heartbeats — advice for a problem they did not have, about
   * a machine that was right there. A state that contradicts what the reader
   * knows teaches them to distrust the screen.
   */
  const silent = (workers.data ?? []).filter((worker) => worker.stale);

  return (
    <Section title="Hand it to a machine">
      <Card className="gap-0 p-4 shadow-none">
        {usable.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No provider is available right now. One that has hit its quota comes
            back on its own — the hub records until when.
          </p>
        ) : attached.length === 0 && silent.length > 0 ? (
          <p className="text-muted-foreground text-sm">
            {silent.length === 1
              ? `${silent[0]?.hostname ?? "A machine"} is attached here but has stopped reporting.`
              : `${silent.length} machines are attached here and none is reporting.`}{" "}
            Work handed over now waits until one comes back — check it is still
            running.
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
              <div className="min-w-56">
                <p className="label mb-1.5">Machine</p>
                <Picker
                  value={workerId}
                  onChange={setWorkerId}
                  placeholder="Hub decides"
                  options={[
                    {
                      value: "any",
                      label: "Hub decides",
                      hint: "picks one that declares the capability",
                    },
                    ...attached.map((worker) => ({
                      value: worker.id,
                      label: worker.hostname,
                      hint: `${worker.operatingSystem}/${worker.architecture} · ${worker.capabilities.join(", ")}`,
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
                        // "any" is this screen's word for "hub decides",
                        // because a Select cannot hold an empty value.
                        ...(workerId && workerId !== "any" ? { workerId } : {}),
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

/**
 * §10.18a — assignment is not delegation.
 *
 * Assigning a task tells somebody to do it. Nobody is waiting, and nothing
 * ties what comes back to whoever wanted it. A thread carrying this task's id
 * is that link: the hub delivers the task's outcome into the thread the
 * moment it settles, so the person who asked is told without watching.
 */
function Delegation({
  task,
  threads,
  onDone,
}: {
  task: TaskView;
  threads: ThreadView[];
  onDone: () => void;
}) {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const [subject, setSubject] = useState("");
  const [asking, setAsking] = useState(false);
  const { run, pending, error } = useAction();

  return (
    <Section title="Delegation" count={threads.length}>
      {threads.length > 0 ? (
        <Panel>
          {threads.map((thread) => (
            <Row key={thread.threadId} href={routes.thread(thread.threadId)}>
              <Stripe tone={toneOf(thread.status)} live={thread.status === "OPEN"} />
              <MessagesSquare className="text-muted-foreground size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm">{thread.subject}</span>
              <span className="measure text-muted-foreground text-xs">
                {thread.turnsLeft}/{thread.turnBudget}
              </span>
              <Status value={thread.status} />
            </Row>
          ))}
        </Panel>
      ) : null}

      {asking ? (
        <Card className="mt-3 gap-3 p-4 shadow-none">
          <Field
            label="What you want to know"
            value={subject}
            onChange={setSubject}
            placeholder="Tell me when this lands, and what you had to change"
            autoFocus
          />
          <p className="text-muted-foreground text-xs leading-relaxed">
            Opened with {task.assignee.type.toLowerCase()}{" "}
            <span className="measure">{task.assignee.id.slice(0, 8)}</span>, the
            actor this task is assigned to. When the task settles, its outcome
            is delivered into the thread by the hub.
          </p>
          {error ? <Note>{error}</Note> : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending || subject.trim().length === 0}
              onClick={() =>
                void run(
                  () =>
                    api.threads.open(workspaceId, {
                      participantType: task.assignee.type,
                      participantId: task.assignee.id,
                      subject: subject.trim(),
                      taskId: task.id,
                    }),
                  () => {
                    setAsking(false);
                    setSubject("");
                    onDone();
                  },
                )
              }
            >
              <MessagesSquare />
              {pending ? "Opening…" : "Open the thread"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <div className={threads.length > 0 ? "mt-3" : undefined}>
          {/**
           * One line, not an empty state.
           *
           * `Empty` is a two-hundred-pixel panel with an icon in the middle,
           * and it earns that when a screen has nothing on it. Here it was
           * announcing the absence of an optional thing on a page full of
           * real content — a large box whose message is "there is nothing
           * here", between two sections that had something.
           */}
          {threads.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nobody is being told what comes of this. Open a thread and the
              outcome is delivered to you instead of you checking back.
            </p>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setAsking(true)}
          >
            <MessagesSquare />
            Follow this task
          </Button>
        </div>
      )}
    </Section>
  );
}
