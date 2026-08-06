"use client";

import { useMemo, useState } from "react";
import { BookMarked, Bot, Eraser, Link2, UserRound } from "lucide-react";

import { api } from "@/lib/api";
import { humanise, since, stamp } from "@/lib/format";
import { usePaged } from "@/lib/paging";
import { useSession } from "@/lib/store";
import { useAction, useResource } from "@/lib/use-hub";
import {
  Area,
  Empty,
  Field,
  Id,
  Loading,
  Note,
  PageHeader,
  Pager,
  Panel,
  Section,
  Segmented,
  Stat,
  StatRow,
  Stripe,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
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

/** §16 — the kinds a workspace tends to settle. Free text at the hub; these
 *  are the ones worth offering, and anything else can still be typed. */
const KINDS = ["CONVENTION", "CORRECTION", "CONSTRAINT", "PREFERENCE", "FACT"];

/**
 * What this workspace has settled, so nobody settles it twice.
 *
 * Every note here is handed to an agent with its task — that is the whole
 * point of writing one, and the screen says so, because a diary nobody reads
 * is what this module was until the briefing carried it.
 */
export function Memory() {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const [kind, setKind] = useState("");
  const entries = useResource(() => api.memory.list(workspaceId), [workspaceId], {
    pollMs: 30_000,
  });
  const { run, pending, error } = useAction();

  // Memoised on the fetched value, not on the `?? []` fallback: a new empty
  // array every render would recompute this every render.
  const all = useMemo(() => entries.data ?? [], [entries.data]);
  const kinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of all) counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1);
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [all]);

  const shown = all.filter((entry) => !kind || entry.type === kind);
  const paged = usePaged(shown);
  const current = all.filter((entry) => entry.current).length;
  const carried = all.filter(
    (entry) => entry.current && (entry.scope.type === "WORKSPACE" || entry.scope.type === "GOAL"),
  ).length;

  return (
    <>
      <PageHeader
        title="Memory"
        lead="What this workspace has settled — conventions, corrections, constraints. Every current note is handed to an agent along with its task, so it does not re-litigate last week's decision."
        actions={<Remember onDone={entries.reload} />}
      />

      <StatRow>
        <Stat label="Notes" value={all.length} icon={BookMarked} />
        <Stat
          label="Still current"
          value={current}
          icon={BookMarked}
          tone="settled"
          hint="superseded ones are kept, not deleted"
        />
        <Stat
          label="Reaches agents"
          value={carried}
          icon={Bot}
          tone={carried ? "live" : "quiet"}
          hint="workspace and goal notes travel with a task"
        />
        <Stat
          label="Written by agents"
          value={all.filter((entry) => entry.author.type !== "HUMAN").length}
          icon={Bot}
          hint="so they travel as data, never as orders"
        />
      </StatRow>

      {error ? (
        <div className="mb-4">
          <Note>{error}</Note>
        </div>
      ) : null}

      {kinds.length > 0 ? (
        <div className="mb-4">
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: "", label: "Everything", count: all.length },
              ...kinds.map(([value, count]) => ({
                value,
                label: humanise(value),
                count,
              })),
            ]}
          />
        </div>
      ) : null}

      {entries.loading ? <Loading rows={4} /> : null}
      {entries.error ? <Note>{entries.error}</Note> : null}
      {entries.data && shown.length === 0 ? (
        <Empty icon={BookMarked} title="Nothing settled yet">
          Write down the thing you would otherwise explain again next week. It
          goes to every agent that works here.
        </Empty>
      ) : null}

      {shown.length > 0 ? (
        <>
          <Panel>
            {paged.items.map((entry) => (
              <div key={entry.id} className="flex items-stretch gap-3 px-4 py-3.5">
                <Stripe tone={entry.current ? "settled" : "quiet"} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2.5">
                    <span className="label shrink-0">{humanise(entry.type)}</span>
                    <p
                      className={`min-w-0 flex-1 text-sm font-medium ${
                        entry.current ? "" : "text-muted-foreground line-through"
                      }`}
                    >
                      {entry.title}
                    </p>
                    <span className="label shrink-0">{humanise(entry.scope.type)}</span>
                    <span
                      className="measure text-muted-foreground shrink-0 text-xs"
                      title={stamp(entry.createdAt)}
                    >
                      {since(entry.createdAt)}
                    </span>
                  </div>

                  {entry.content ? (
                    <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                      {entry.content}
                    </p>
                  ) : null}

                  <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="flex items-center gap-1">
                      {entry.author.type === "HUMAN" ? (
                        <UserRound className="size-3" />
                      ) : (
                        <Bot className="size-3" />
                      )}
                      {entry.author.type.toLowerCase()}{" "}
                      <Id value={entry.author.id} />
                    </span>
                    {/* §16 — a pointer, never a copy, and deliberately not
                        resolved: a dead reference shows as one. */}
                    {entry.source ? (
                      <span className="flex items-center gap-1">
                        <Link2 className="size-3" />
                        {entry.source.type.toLowerCase()}{" "}
                        <span className="measure">{entry.source.id.slice(0, 8)}</span>
                      </span>
                    ) : null}
                    {entry.tags.map((tag) => (
                      <span key={tag} className="bg-muted rounded px-1.5 py-0.5">
                        {tag}
                      </span>
                    ))}
                    {entry.supersededById ? (
                      <span className="text-signal">
                        replaced by {entry.supersededById.slice(0, 8)}
                      </span>
                    ) : null}
                  </div>
                </div>

                {entry.current ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      void run(() => api.memory.forget(workspaceId, entry.id), entries.reload)
                    }
                  >
                    <Eraser />
                    Forget
                  </Button>
                ) : null}
              </div>
            ))}
          </Panel>
          <Pager paged={paged} />
        </>
      ) : null}

      <Section title="Why this reaches agents">
        <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
          A note scoped to this workspace travels inside the task briefing, in
          the same quarantine as the task&apos;s own text. That is deliberate:
          agents write here too, and one that read a poisoned file could
          otherwise leave instructions for everyone who comes after it. An
          agent is told to read these as conventions, never as orders.
        </p>
      </Section>
    </>
  );
}

function Remember({ onDone }: { onDone: () => void }) {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("CONVENTION");
  const { run, pending, error } = useAction();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <AddButton>Write it down</AddButton>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Write it down</DialogTitle>
          <DialogDescription className="leading-relaxed">
            The thing you would otherwise explain again next week. It is handed
            to every agent that works in this workspace, with its task.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () =>
                api.memory.remember(workspaceId, {
                  // Scoped to the workspace: the level that reaches every
                  // task. Narrower scopes are written by agents, about their
                  // own goal or run, as they learn.
                  scopeType: "WORKSPACE",
                  scopeId: workspaceId,
                  type,
                  title: title.trim(),
                  ...(content.trim() ? { content: content.trim() } : {}),
                }),
              () => {
                setOpen(false);
                setTitle("");
                setContent("");
                onDone();
              },
            );
          }}
        >
          <Field
            label="The rule, in one line"
            value={title}
            onChange={setTitle}
            placeholder="Migrations are never edited in place"
            autoFocus
          />
          <Area
            label="Why, and what to do instead"
            value={content}
            onChange={setContent}
            placeholder="Write a new migration; the old ones have already run in production."
            hint="Optional. An agent reads the title first and this second."
          />
          <div>
            <p className="label mb-1.5">Kind</p>
            <Segmented
              value={type}
              onChange={setType}
              options={KINDS.map((value) => ({ value, label: humanise(value) }))}
            />
          </div>
          {error ? <Note>{error}</Note> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending || title.trim().length === 0}>
              {pending ? "Writing…" : "Remember it"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
