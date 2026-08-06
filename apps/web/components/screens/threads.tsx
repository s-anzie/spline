"use client";

import { useState } from "react";
import {
  ArrowRight,
  CornerDownLeft,
  Hand,
  MessagesSquare,
  Send,
} from "lucide-react";
import Link from "next/link";

import { api, type MemberView, type ThreadView } from "@/lib/api";
import { humanise, since, stamp } from "@/lib/format";
import { usePaged } from "@/lib/paging";
import { routes } from "@/lib/routes";
import { useSession } from "@/lib/store";
import { toneOf } from "@/lib/tone";
import { useAction, useResource } from "@/lib/use-hub";
import {
  Area,
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
  Payload,
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

  if (thread.loading) return <Loading rows={4} />;
  if (thread.error || !thread.data) return <Note>{thread.error ?? "Not found"}</Note>;
  const view: ThreadView = thread.data;

  const speak = (text?: string) =>
    void run(() => api.threads.speak(workspaceId, threadId, text), () => {
      setMessage("");
      thread.reload();
    });

  const live = view.status === "OPEN";

  return (
    <>
      <BackTo label="Conversations" href={routes.threads} />
      <PageHeader title={view.subject} actions={<Status value={view.status} />} />

      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <div>
          <Section title="Turns" count={view.turns.length}>
            <Card className="gap-0 p-5 shadow-none">
              <ol className="space-y-5">
                {view.turns.map((turn, index) => {
                  const mine = turn.actor.id === userId;
                  return (
                    <li key={index} className="flex gap-3">
                      <span
                        className={`mt-1 h-full w-[2px] shrink-0 rounded-full ${
                          mine ? "bg-border" : "bg-[var(--live)]"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-muted-foreground mb-1 text-xs">
                          <span className="text-foreground font-medium">
                            {mine ? "you" : nameOf(turn.actor)}
                          </span>
                          <span className="ml-2" title={stamp(turn.at)}>
                            {since(turn.at)}
                          </span>
                        </p>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {turn.message}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          </Section>

          {view.outcome ? (
            <Section title="What came of it">
              <Card className="gap-0 p-4 shadow-none">
                <Payload value={view.outcome} />
              </Card>
            </Section>
          ) : null}

          {live ? (
            <Section title={`Reply — ${view.turnsLeft} turn${view.turnsLeft === 1 ? "" : "s"} left`}>
              <Card className="gap-3 p-4 shadow-none">
                <Area
                  label="Your turn"
                  value={message}
                  onChange={setMessage}
                  placeholder="What you want them to know, or to do next."
                />
                {error ? <Note>{error}</Note> : null}
                <div className="flex flex-wrap gap-2">
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
                </div>
              </Card>
            </Section>
          ) : (
            <Note tone={view.status === "EXHAUSTED" ? "signal" : "quiet"}>
              {view.status === "EXHAUSTED"
                ? "This thread ran out of turns. Open a new one with a narrower question rather than reopening this."
                : "This thread is closed."}
            </Note>
          )}
        </div>

        <Card className="h-fit gap-0 p-4 shadow-none">
          <Facts
            items={[
              ["thread", <Id key="id" value={view.threadId} />],
              ["asked by", nameOf(view.initiator)],
              ["asked of", nameOf(view.participant)],
              [
                "delegated",
                view.taskId ? (
                  <Link
                    href={routes.task(view.taskId)}
                    className="underline underline-offset-2"
                  >
                    {view.taskId.slice(0, 8)}
                  </Link>
                ) : (
                  "nothing — this is a question"
                ),
              ],
              ["turns", `${view.turnsLeft} of ${view.turnBudget} left`],
              ["awaiting", view.awaiting ? "them" : "nobody"],
            ]}
          />
        </Card>
      </div>
    </>
  );
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
  const { run, pending, error } = useAction();

  const others = members.filter((member) => member.actorId !== userId);
  const chosen = others.find(
    (member) => `${member.actorType}:${member.actorId}` === participant,
  );

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
                }),
              () => {
                setOpen(false);
                setSubject("");
                onDone();
              },
            );
          }}
        >
          <Field
            label="What you need"
            value={subject}
            onChange={setSubject}
            placeholder="Can you check whether the OIDC provider rotates its JWKS?"
            autoFocus
          />
          <div>
            <p className="label mb-1.5">Ask</p>
            {others.length === 0 ? (
              <Note>
                Nobody else is in this workspace yet. Add a person or create an
                agent in Workspace → People.
              </Note>
            ) : (
              <Segmented
                value={participant}
                onChange={setParticipant}
                options={others.map((member) => ({
                  value: `${member.actorType}:${member.actorId}`,
                  label:
                    member.displayName ??
                    member.email ??
                    `${member.actorType.toLowerCase()} ${member.actorId.slice(0, 8)}`,
                }))}
              />
            )}
          </div>
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
