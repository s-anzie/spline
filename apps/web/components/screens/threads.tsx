"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  CornerDownLeft,
  Hand,
  MessagesSquare,
  Send,
} from "lucide-react";
import Link from "next/link";

import { api, type MemberView, type RunView, type ThreadView } from "@/lib/api";
import { humanise, since, stamp } from "@/lib/format";
import { usePaged } from "@/lib/paging";
import { routes } from "@/lib/routes";
import { useSession } from "@/lib/store";
import { toneOf } from "@/lib/tone";
import { readable } from "@/lib/activity";
import { useAction, useResource } from "@/lib/use-hub";
import {
  Area,
  BackTo,
  Empty,
  Field,
  Id,
  Loading,
  Note,
  PageHeader,
  Pager,
  Panel,
  Picker,
  Payload,
  Row,
  Segmented,
  Stat,
  StatRow,
  Status,
  Stripe,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AddButton } from "@/components/forms";

/**
 * Asking somebody to do something, and being told what came of it.
 *
 * This is the shape §10.18a took from OpenClaw's `sessions_spawn`: assignment
 * alone tells somebody to work but leaves nobody waiting and nothing tying
 * the answer back to the question. A thread names both sides, carries the
 * task it delegated, and ends — either because somebody said they had
 * nothing to add, or because the work it was waiting on settled.
 */
export function ThreadList() {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const threads = useResource(() => api.threads.mine(workspaceId), [workspaceId], {
    pollMs: 12_000,
  });
  const members = useResource(() => api.members.list(workspaceId), [workspaceId]);

  const all = threads.data ?? [];
  const waiting = all.filter((thread) => thread.awaiting).length;
  const open = all.filter((thread) => thread.status === "OPEN").length;
  const spent = all.filter((thread) => thread.status === "EXHAUSTED").length;
  const paged = usePaged(all);

  return (
    <>
      <PageHeader
        title="Conversations"
        lead="Where you ask, and where you are answered. A thread is bounded on purpose — past a handful of turns two parties are not converging, they are looping."
        actions={
          <OpenThread
            members={members.data ?? []}
            onDone={threads.reload}
            trigger={<AddButton>Ask somebody</AddButton>}
          />
        }
      />

      <StatRow>
        <Stat
          label="Waiting on them"
          value={waiting}
          icon={Hand}
          tone={waiting ? "waiting" : "quiet"}
          hint={waiting ? "you spoke last" : "nothing is pending on you"}
        />
        <Stat label="Open" value={open} icon={MessagesSquare} tone="live" />
        <Stat
          label="Ran out of turns"
          value={spent}
          icon={CornerDownLeft}
          tone={spent ? "signal" : "quiet"}
          hint={spent ? "reopen with a narrower question" : "none exhausted"}
        />
        <Stat label="All yours" value={all.length} icon={MessagesSquare} />
      </StatRow>

      {threads.loading ? <Loading rows={4} /> : null}
      {threads.error ? <Note>{threads.error}</Note> : null}
      {threads.data && all.length === 0 ? (
        <Empty icon={MessagesSquare} title="Nothing has been asked yet">
          Open a thread when you need somebody — a person or an agent — to do
          something and tell you what came of it.
        </Empty>
      ) : null}

      {all.length > 0 ? (
        <>
          <Panel>
            {paged.items.map((thread) => (
              <Row key={thread.threadId} href={routes.thread(thread.threadId)} className="py-3">
                <Stripe tone={toneOf(thread.status)} live={thread.status === "OPEN"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{thread.subject}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    with {thread.participant.type.toLowerCase()}{" "}
                    <span className="measure">{thread.participant.id.slice(0, 8)}</span>
                    {thread.taskId ? (
                      <>
                        {" · task "}
                        <span className="measure">{thread.taskId.slice(0, 8)}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                {/* The budget is shown before it is spent — learning about a
                    ceiling after hitting it is not a ceiling, it is a trap. */}
                <span className="measure text-muted-foreground w-16 shrink-0 text-right text-xs">
                  {thread.turnsLeft}/{thread.turnBudget}
                </span>
                <Status value={thread.status} />
                <span className="measure text-muted-foreground w-16 shrink-0 text-right text-xs">
                  {since(thread.turns.at(-1)?.at)}
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

/**
 * §10.18a, §17 — the thread, and what the agent did inside it.
 *
 * Laid out as a conversation rather than as a page of sections, and the
 * difference is not cosmetic: a thread is read from the bottom, where the
 * newest thing is, and answered from a box that should not move. The old
 * layout scrolled the whole page, so the composer wandered off-screen exactly
 * when the thread got long enough to need one.
 *
 * The agent's ACTIVITY is interleaved with the turns, in time order. Watching
 * a manager say nothing for four minutes and then answer is indistinguishable
 * from watching it die; seeing it read three files and reach for a fourth is
 * the difference between waiting and worrying.
 */
export function ThreadDetail({ threadId }: { threadId: string }) {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const userId = useSession((state) => state.userId);
  const thread = useResource(
    () => api.threads.get(workspaceId, threadId),
    [workspaceId, threadId],
    { pollMs: 8_000 },
  );
  // The hub answers with actor references; the member list is what turns one
  // into "Scout". Resolved here rather than in the hub, because the mapping
  // is workspace-scoped and this is the only screen that needs it.
  const members = useResource(() => api.members.list(workspaceId), [workspaceId]);

  /**
   * §17 — the work this thread delegated, and what it did while doing it.
   *
   * Polled faster than the thread because it is the part that moves: a turn
   * arrives every few minutes, a tool call every few seconds.
   */
  const taskId = thread.data?.taskId ?? null;
  const runs = useResource(
    () => api.runs.list(workspaceId, { taskId: taskId! }),
    [workspaceId, taskId],
    { pollMs: 5_000, enabled: Boolean(taskId) },
  );

  const nameOf = (actor: { type: string; id: string }) => {
    const member = (members.data ?? []).find(
      (entry) => entry.actorId === actor.id && entry.actorType === actor.type,
    );
    return (
      member?.displayName ??
      member?.email ??
      `${actor.type.toLowerCase()} ${actor.id.slice(0, 8)}`
    );
  };
  const [message, setMessage] = useState("");
  const { run, pending, error } = useAction();

  const bottom = useRef<HTMLDivElement>(null);
  const entries = useMemo(
    () => timeline(thread.data, runs.data ?? []),
    [thread.data, runs.data],
  );

  /**
   * Kept at the newest entry as things arrive. Without this the interesting
   * end of a live thread sits below the fold and somebody has to chase it.
   */
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [entries.length]);

  if (thread.loading) return <Loading rows={4} />;
  if (thread.error || !thread.data) return <Note>{thread.error ?? "Not found"}</Note>;
  const view: ThreadView = thread.data;

  const speak = (text?: string) =>
    void run(() => api.threads.speak(workspaceId, threadId, text), () => {
      setMessage("");
      thread.reload();
    });

  const live = view.status === "OPEN";
  const working = (runs.data ?? []).some((entry) => entry.status === "RUNNING");

  return (
    /**
     * The frame is the height of the console's own content area, and only the
     * thread inside it scrolls. `min-h-0` on the scrolling child is what makes
     * that true in a flex column — without it the child grows instead, and the
     * page scrolls after all.
     */
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="shrink-0">
        <BackTo label="Conversations" href={routes.threads} />
        <PageHeader
          title={view.subject}
          actions={
            <div className="flex items-center gap-2.5">
              {working ? (
                <span className="text-live inline-flex items-center gap-1.5 text-xs">
                  <span className="bg-live size-1.5 animate-pulse rounded-full" />
                  working
                </span>
              ) : null}
              <Status value={view.status} />
            </div>
          }
        />
        {/**
         * The column that used to hold these is gone — a conversation needs
         * its width. What is left is what a reader actually reaches for: who
         * it is with, the work it delegated, and how many turns remain.
         */}
        <div className="text-muted-foreground mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          <span>
            with{" "}
            <span className="text-foreground font-medium">
              {nameOf(view.participant)}
            </span>
          </span>
          {view.taskId ? (
            <Link
              href={routes.task(view.taskId)}
              className="hover:text-foreground underline underline-offset-2 transition-colors"
            >
              the work it delegated
            </Link>
          ) : (
            <span>a question — nothing was delegated</span>
          )}
          <span className="measure">
            {view.turnsLeft} of {view.turnBudget} turns left
          </span>
          <Id value={view.threadId} />
        </div>
      </div>

      <Card className="min-h-0 flex-1 gap-0 overflow-hidden p-0 shadow-none">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing said yet. {view.taskId ? "The work has been handed over — what it does will appear here." : ""}
            </p>
          ) : null}

          {entries.map((entry) =>
            entry.kind === "turn" ? (
              <div key={entry.key} className="flex gap-3">
                <span
                  className={`mt-1 w-[2px] shrink-0 self-stretch rounded-full ${
                    entry.actor?.id === userId ? "bg-border" : "bg-[var(--live)]"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground mb-1 text-xs">
                    <span className="text-foreground font-medium">
                      {entry.actor?.id === userId ? "you" : nameOf(entry.actor!)}
                    </span>
                    <span className="ml-2" title={stamp(entry.at)}>
                      {since(entry.at)}
                    </span>
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {entry.text}
                  </p>
                </div>
              </div>
            ) : (
              <Work key={entry.key} entry={entry} />
            ),
          )}

          {view.outcome ? (
            <div className="border-border rounded-lg border p-3">
              <p className="label mb-2">What came of it</p>
              <Payload value={view.outcome} open />
            </div>
          ) : null}

          <div ref={bottom} />
        </div>

        {/* Fixed at the foot of the frame: a composer that scrolls away is a
            composer somebody has to hunt for. */}
        <div className="border-border bg-muted/30 shrink-0 border-t p-4">
          {live ? (
            <>
              <Area
                label={`Your turn — ${view.turnsLeft} of ${view.turnBudget} left`}
                value={message}
                onChange={setMessage}
                rows={3}
                placeholder="What you want them to know, or to do next."
              />
              {error ? (
                <div className="mt-2">
                  <Note>{error}</Note>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={pending || message.trim().length === 0 || view.turnsLeft === 0}
                  onClick={() => speak(message.trim())}
                >
                  <Send />
                  Send
                </Button>
                {/* §10.18b — the polite stop. Without it, a finished thread
                    and a truncated one are the same event. */}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => speak(undefined)}
                >
                  I have nothing to add
                </Button>
                <span className="text-muted-foreground ml-auto text-xs">
                  {view.awaiting ? "waiting on them" : "your move"}
                </span>
              </div>
            </>
          ) : (
            <Note tone={view.status === "EXHAUSTED" ? "signal" : "quiet"}>
              {view.status === "EXHAUSTED"
                ? "This thread ran out of turns. Open a new one with a narrower question rather than reopening this."
                : "This thread is closed."}
            </Note>
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * A stretch of work between two things that were said.
 *
 * The version this replaces printed one full-width row per trace entry, in
 * the same register as a turn. One ordinary run produced fourteen of them —
 * `mcp__spline__release_lock`, `ToolSearch`, `Write —
 * /tmp/claude-1000/-home-bradley-…/hello.txt` — and the two sentences anybody
 * had actually said were lost among them. The conversation had become a log.
 *
 * A trace is evidence that the silence is work rather than a hang. That is a
 * real need, and a quiet one: it earns one line, and the line only opens for
 * somebody who asks. What the agent SAID stays in its own voice, indented
 * with the work but at full size, because it is speech.
 */
function Work({ entry }: { entry: Entry }) {
  const [open, setOpen] = useState(false);
  const steps = entry.steps ?? [entry.text];

  // Something it said out loud, not something it did.
  if (!entry.quiet) {
    return (
      <div className="flex gap-3 pl-5">
        <span className="bg-border mt-1 w-px shrink-0 self-stretch" />
        <p className="text-muted-foreground min-w-0 flex-1 text-sm leading-relaxed">
          {entry.text}
        </p>
      </div>
    );
  }

  /**
   * One step is a sentence; several are a summary with the rest behind a
   * disclosure. The count is in the summary because "worked" without a size
   * tells a reader nothing about whether to look.
   */
  return (
    <div className="pl-5">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        className="text-muted-foreground/80 hover:text-foreground flex items-baseline gap-2 text-left text-xs transition-colors"
      >
        <span className="bg-muted-foreground/40 mt-1.5 size-1 shrink-0 rounded-full" />
        <span>
          {steps.length === 1
            ? steps[0]
            : `${steps[0]} and ${steps.length - 1} more ${steps.length === 2 ? "step" : "steps"}`}
        </span>
        {steps.length > 1 ? (
          <ChevronDown
            className={`size-3 shrink-0 self-center transition-transform ${open ? "rotate-180" : ""}`}
          />
        ) : null}
      </button>

      {open && steps.length > 1 ? (
        <ol className="text-muted-foreground/70 mt-1.5 space-y-1 pl-5 text-xs">
          {steps.map((step, at) => (
            <li key={`${entry.key}-${at}`}>{step}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

interface Entry {
  key: string;
  kind: "turn" | "step";
  at: string;
  text: string;
  actor?: { type: string; id: string };
  /** Every step in this stretch of work, oldest first. */
  steps?: string[];
  /** Machinery rather than speech: shown smaller, and foldable. */
  quiet?: boolean;
}

/**
 * §10.18a, §17 — the turns and the work, in the order they happened.
 *
 * Merged on time rather than shown in two columns: a manager's tool call
 * belongs between the question that caused it and the answer it led to, and
 * splitting them makes a reader reconstruct the order in their head.
 */
function timeline(
  thread: ThreadView | null | undefined,
  runs: RunView[],
): Entry[] {
  if (!thread) return [];

  const turns: Entry[] = thread.turns.map((turn, at) => ({
    key: `turn-${at}`,
    kind: "turn",
    at: turn.at,
    text: turn.message,
    actor: turn.actor,
  }));

  /**
   * §17 — the steps, translated and stripped of the ones nobody needs.
   *
   * `readable` returns null for internal machinery, and a run that spent
   * three calls looking its own tools up should not spend three lines of a
   * conversation saying so.
   */
  const steps: Step[] = runs.flatMap((run) =>
    (run.attempts ?? []).flatMap((attempt) =>
      (attempt.trace ?? []).flatMap((entry, at): Step[] => {
        // `result` repeats the last thing said, word for word. Printing both
        // made every run end by saying the same paragraph twice.
        if (entry.kind === "result") return [];
        if (entry.kind === "said") {
          return [{ key: `${run.runId}-${attempt.number}-${at}`, at: entry.at, said: entry.text }];
        }
        const words = readable(entry.text);
        return words
          ? [{ key: `${run.runId}-${attempt.number}-${at}`, at: entry.at, did: words }]
          : [];
      }),
    ),
  );

  const activity: Entry[] = steps.map((step) => ({
    key: step.key,
    kind: "step",
    at: step.at,
    text: step.said ?? step.did ?? "",
    ...(step.said ? {} : { quiet: true }),
  }));

  const ordered = [...turns, ...activity].sort(
    (left, right) => new Date(left.at).getTime() - new Date(right.at).getTime(),
  );

  /**
   * Consecutive steps become ONE entry.
   *
   * This is the whole point. Fourteen rows of machinery between two sentences
   * is a log; one line saying "took a lock · wrote hello.txt · ran git
   * commit · released the lock" is an account of what happened, and it sits
   * inside the conversation instead of drowning it.
   */
  const merged: Entry[] = [];
  for (const entry of ordered) {
    const last = merged[merged.length - 1];
    /**
     * Only machinery merges. Speech never does: an agent saying "both Write
     * and Bash are denied" is the most important line of its run, and the
     * first version of this fold swallowed it into a step count — which
     * traded fourteen rows of noise for the loss of the one sentence that
     * explained everything.
     */
    if (entry.kind === "step" && entry.quiet && last?.kind === "step" && last.quiet) {
      last.steps = [...(last.steps ?? [last.text]), entry.text];
      last.at = entry.at;
      continue;
    }
    merged.push({ ...entry, ...(entry.kind === "step" ? { steps: [entry.text] } : {}) });
  }
  return merged;
}

interface Step {
  key: string;
  at: string;
  /** Something the agent said out loud, which stays in its own voice. */
  said?: string;
  /** Something it did, already in a person's words. */
  did?: string;
}

/**
 * Opening a thread names both sides. A thread with one side is a note.
 *
 * When it is tied to a task, the hub delivers that task's outcome into the
 * thread by itself — the requester is told without having to watch.
 */
function OpenThread({
  members,
  trigger,
  onDone,
}: {
  members: MemberView[];
  trigger: React.ReactNode;
  onDone: () => void;
}) {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const userId = useSession((state) => state.userId);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [participant, setParticipant] = useState("");
  const [handOver, setHandOver] = useState(false);
  const [repositoryId, setRepositoryId] = useState("");
  const { run, pending, error } = useAction();

  /**
   * §8.3 — the projects this workspace has, if any.
   *
   * Asked for only here in this screen: a need handed over without a project
   * produces a manager with nothing to pass down, and none of the tasks it
   * cuts touches any code. That failure is silent and expensive.
   */
  const repositories = useResource(
    () => api.repositories.list(workspaceId),
    [workspaceId],
  );

  const others = members.filter((member) => member.actorId !== userId);
  const chosen = others.find(
    (member) => `${member.actorType}:${member.actorId}` === participant,
  );
  /**
   * §4.6 — only somebody who organises can be handed a need.
   *
   * The choice appears when it applies rather than being offered and then
   * refused: a control that is always there and usually fails teaches people
   * to distrust the form.
   */
  const canOrganise = chosen?.role === "AGENT_MANAGER" || chosen?.role === "OWNER";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ask somebody</DialogTitle>
          <DialogDescription className="leading-relaxed">
            They are told, and you are told what came of it. Five turns at
            most — enough to agree on something, not enough to negotiate
            forever.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () =>
                api.threads.open(workspaceId, {
                  participantType: chosen!.actorType,
                  participantId: chosen!.actorId,
                  subject: subject.trim(),
                  ...(canOrganise && handOver ? { handOver: true } : {}),
                  ...(canOrganise && handOver && repositoryId
                    ? { repositoryId }
                    : {}),
                }),
              () => {
                setOpen(false);
                setSubject("");
                setHandOver(false);
                onDone();
              },
            );
          }}
        >
          {/* A question fits on a line; a need does not. The box grows once
              the answer is going to be work rather than a reply. */}
          {canOrganise && handOver ? (
            <Area
              label="What you need"
              value={subject}
              onChange={setSubject}
              rows={5}
              placeholder="Improve the document creation flow, and take every piece of information it needs into account."
              hint="In your own words. They work out what it means, state the goal, and cut it into tasks."
            />
          ) : (
            <Field
              label="What you need"
              value={subject}
              onChange={setSubject}
              placeholder="Can you check whether the OIDC provider rotates its JWKS?"
              autoFocus
            />
          )}
          <div>
            <p className="label mb-1.5">Ask</p>
            {others.length === 0 ? (
              <Note>
                Nobody else is in this workspace yet. Add a person or create an
                agent in Workspace → People.
              </Note>
            ) : (
              <Picker
                value={participant}
                onChange={setParticipant}
                placeholder="Choose a person or an agent"
                options={others.map((member) => ({
                  value: `${member.actorType}:${member.actorId}`,
                  label:
                    member.displayName ??
                    member.email ??
                    `${member.actorType.toLowerCase()} ${member.actorId.slice(0, 8)}`,
                  hint: `${member.actorType.toLowerCase()} · ${humanise(member.role)}`,
                }))}
              />
            )}
          </div>

          {canOrganise ? (
            <div className="border-border bg-muted/40 rounded-lg border p-3">
              <p className="label mb-2">
                {chosen?.displayName ?? "They"} can organise work
              </p>
              <Segmented
                value={handOver ? "work" : "question"}
                onChange={(next) => setHandOver(next === "work")}
                options={[
                  { value: "question", label: "Ask a question" },
                  { value: "work", label: "Hand it over" },
                ]}
              />
              <p className="text-muted-foreground mt-2.5 text-xs leading-relaxed">
                {handOver
                  ? "They work out what it means, state the goal with what would prove it reached, and cut it into tasks for whoever should do them. You are told here when it is done."
                  : "They read it and answer you. Nothing is created and nobody is put to work."}
              </p>

              {/**
               * §8.3 — the project, chosen where the need is stated.
               *
               * The manager passes it to every task it cuts, so leaving it
               * out here means none of the work touches any code — a failure
               * that shows up as five tasks quietly editing nothing.
               */}
              {handOver && (repositories.data ?? []).length > 0 ? (
                <div className="mt-3">
                  <p className="label mb-1.5">Which project</p>
                  <Picker
                    value={repositoryId}
                    onChange={setRepositoryId}
                    placeholder="No project — nothing they make will touch code"
                    options={[
                      {
                        value: "",
                        label: "No project",
                        hint: "for work that is not about code",
                      },
                      ...(repositories.data ?? []).map((repository) => ({
                        value: repository.id,
                        label: repository.name,
                        hint:
                          repository.localPath ??
                          repository.origin ??
                          repository.defaultBranch,
                      })),
                    ]}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {chosen ? (
            <p className="text-muted-foreground text-xs leading-relaxed">
              {humanise(chosen.role)} — {chosen.actorType === "AGENT"
                ? "an agent answers on its own; you are told when it does"
                : "a person answers when they get to it"}
            </p>
          ) : null}
          {error ? <Note>{error}</Note> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending || !chosen || !subject.trim()}>
              {pending ? "Opening…" : "Open the thread"}
              <ArrowRight />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
