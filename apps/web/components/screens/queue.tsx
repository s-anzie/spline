"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCheck,
  CircleSlash,
  Cpu,
  EarOff,
  Hourglass,
  OctagonAlert,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { api } from "@/lib/api";
import { since } from "@/lib/format";
import { loadQueue, type Intervention, type InterventionKind } from "@/lib/queue";
import { usePaged } from "@/lib/paging";
import { routes } from "@/lib/routes";
import { useOrganizationId, useSession } from "@/lib/store";
import type { Tone } from "@/lib/tone";
import { useAction, useResource } from "@/lib/use-hub";
import {
  Empty,
  Field,
  Loading,
  Note,
  PageHeader,
  Pager,
  Panel,
  Stat,
  StatRow,
  Stripe,
} from "@/components/kit";
import { Button } from "@/components/ui/button";

/** How loudly each kind asks, and what it looks like. */
const KIND: Record<
  InterventionKind,
  { tone: Tone; label: string; icon: typeof Cpu }
> = {
  enrolment: { tone: "waiting", label: "machine", icon: Cpu },
  validation: { tone: "waiting", label: "validation", icon: ShieldCheck },
  blocked: { tone: "signal", label: "blocker", icon: OctagonAlert },
  silent: { tone: "signal", label: "silence", icon: EarOff },
  stuck: { tone: "signal", label: "stuck order", icon: Hourglass },
};

export function Queue() {
  const workspaceId = useSession((state) => state.workspaceId);
  const organizationId = useOrganizationId();

  // The queue is gathered from five routes and tolerates any of them failing
  // (see `loadQueue`), so it always resolves — there is no error branch here.
  const queue = useResource<Intervention[]>(
    () =>
      loadQueue(organizationId, workspaceId!).then((value) => ({
        ok: true as const,
        value,
      })),
    [workspaceId, organizationId],
    { pollMs: 15_000, enabled: Boolean(workspaceId) },
  );

  const entries = queue.data ?? [];
  const paged = usePaged(entries);
  const count = (kind: InterventionKind) =>
    entries.filter((entry) => entry.kind === kind).length;
  const urgent = entries.filter(
    (entry) => KIND[entry.kind].tone === "signal",
  ).length;

  return (
    <>
      <PageHeader
        title="What needs you"
        lead="Everything the hub knows about and will not decide by itself. Oldest first — what has waited longest is what has been forgotten."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={queue.reload}
            disabled={queue.refreshing}
          >
            <RefreshCw
              className={queue.refreshing ? "animate-spin" : undefined}
            />
            Check again
          </Button>
        }
      />

      <StatRow>
        <Stat
          label="Needs you"
          value={entries.length}
          icon={OctagonAlert}
          tone={urgent > 0 ? "signal" : entries.length > 0 ? "waiting" : "settled"}
          hint={urgent > 0 ? `${urgent} cannot wait` : "nothing is urgent"}
        />
        <Stat
          label="To validate"
          value={count("validation")}
          icon={ShieldCheck}
          tone="waiting"
          hint="a run finished and wants a verdict"
        />
        <Stat
          label="Blocked"
          value={count("blocked")}
          icon={OctagonAlert}
          tone="signal"
          hint="an agent cannot get past it alone"
        />
        <Stat
          label="To pair"
          value={count("enrolment")}
          icon={Cpu}
          tone="waiting"
          hint="a machine is waiting at the door"
        />
      </StatRow>

      {queue.loading ? <Loading rows={3} /> : null}

      {queue.data && entries.length === 0 ? (
        <Empty icon={CheckCheck} title="Nothing is waiting on a person">
          That is not the same as nothing happening.{" "}
          <Link href={routes.runs} className="text-foreground underline underline-offset-2">
            Runs
          </Link>{" "}
          shows what is executing, and{" "}
          <Link
            href={routes.activity}
            className="text-foreground underline underline-offset-2"
          >
            Activity
          </Link>{" "}
          shows what the workspace has been doing.
        </Empty>
      ) : null}

      {entries.length > 0 ? (
        <>
          <Panel>
            {paged.items.map((entry) => (
              <QueueRow key={entry.key} entry={entry} onDone={queue.reload} />
            ))}
          </Panel>
          <Pager paged={paged} />
        </>
      ) : null}
    </>
  );
}

function QueueRow({ entry, onDone }: { entry: Intervention; onDone: () => void }) {
  const [pairing, setPairing] = useState(false);
  const kind = KIND[entry.kind];

  return (
    <div className="hover:bg-accent/40 flex items-stretch gap-3 px-4 py-3.5 transition-colors">
      {/* An entry nobody can act on is shown, and shown as inert. */}
      <Stripe
        tone={entry.actionable ? kind.tone : "quiet"}
        live={entry.actionable && entry.kind === "silent"}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2.5">
          <span className="label flex shrink-0 items-center gap-1.5">
            <kind.icon className="size-3" strokeWidth={2} />
            {kind.label}
          </span>
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{entry.title}</p>
          <span className="measure text-muted-foreground shrink-0 text-xs">
            {since(entry.since)}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          {entry.detail}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {entry.inline === "approve-machine" ? (
            <Button size="sm" onClick={() => setPairing((open) => !open)}>
              {pairing ? "Cancel" : "Pair this machine"}
            </Button>
          ) : null}
          {/**
           * §11 — the verdict, where the question is asked.
           *
           * This screen told somebody that work was waiting on them and
           * offered "Open →", which led to a screen with nothing to press.
           * Being asked to intervene without being given the means is worse
           * than not being asked: it teaches a reader that the queue is
           * decoration.
           */}
          {entry.inline === "settle-validation" && entry.validationId ? (
            <Settle validationId={entry.validationId} onDone={onDone} />
          ) : null}
          {entry.href ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href={entry.href}>
                Open
                <ArrowRight />
              </Link>
            </Button>
          ) : null}
        </div>

        {pairing ? <PairMachine onDone={onDone} /> : null}
      </div>
    </div>
  );
}

/**
 * §11 — pass or refuse, in one press.
 *
 * Two buttons rather than a form: the verdict IS the decision, and asking
 * somebody to write a paragraph before they can say "yes" is how a queue
 * stops being cleared. A refusal takes a reason, because a refusal without
 * one leaves the agent exactly where it was.
 *
 * `START` before the verdict because §11 gives a validation a life: PENDING
 * → RUNNING → settled. Pressing once should not require the reader to know
 * that, so the two steps happen behind the one press.
 */
function Settle({
  validationId,
  onDone,
}: {
  validationId: string;
  onDone: () => void;
}) {
  const workspaceId = useSession((state) => state.workspaceId)!;
  const [refusing, setRefusing] = useState(false);
  const [why, setWhy] = useState("");
  const { run, pending, error } = useAction();

  const pronounce = (action: "SUCCEEDED" | "FAILED", output?: string) =>
    void run(async () => {
      const started = await api.validations.settle(workspaceId, validationId, "START");
      // A validation already RUNNING refuses START, and that is not a failure
      // — it is somebody having pressed first, or a retry of this very click.
      if (!started.ok && started.error.status >= 500) {
        return started;
      }
      return api.validations.settle(workspaceId, validationId, action, output);
    }, onDone);

  if (refusing) {
    return (
      <div className="flex w-full flex-wrap items-center gap-2">
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
    <>
      <Button size="sm" disabled={pending} onClick={() => pronounce("SUCCEEDED")}>
        <Check />
        {pending ? "Approving…" : "It passes"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setRefusing(true)}>
        Send it back
      </Button>
      {error ? <Note>{error}</Note> : null}
    </>
  );
}

/**
 * §6.3 — pairing takes the code printed on that machine's own console, and
 * the hub never lists it.
 *
 * That is the whole point: typing it is what proves the person approving can
 * see the machine they are letting in. A dropdown of pending hostnames with
 * an "approve" button beside each would approve whatever asked — which is
 * CVE-2026-44118 with extra steps.
 */
function PairMachine({ onDone }: { onDone: () => void }) {
  const organizationId = useOrganizationId();
  const [code, setCode] = useState("");
  const { run, pending, error } = useAction();

  if (!organizationId) {
    return (
      <div className="mt-3 max-w-sm">
        <Note>You are not an owner of any organization, so you cannot pair machines.</Note>
      </div>
    );
  }

  const decide = (approve: boolean) =>
    void run(
      () => api.enrolments.decide(organizationId, code.trim().toUpperCase(), approve),
      () => {
        setCode("");
        onDone();
      },
    );

  return (
    <form
      className="bg-muted/60 mt-3 max-w-md space-y-3 rounded-lg p-3"
      onSubmit={(event) => {
        event.preventDefault();
        decide(true);
      }}
    >
      <Field
        label="Code shown on that machine"
        value={code}
        onChange={setCode}
        placeholder="Q6YWCJ19"
        autoFocus
      />
      <p className="text-muted-foreground text-xs leading-relaxed">
        Read it off that machine&apos;s own console. Nobody with network access
        alone can see it — that is what makes it proof.
      </p>
      {error ? <Note>{error}</Note> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || code.trim().length < 4}>
          <CheckCheck />
          {pending ? "Pairing…" : "Pair"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-signal"
          disabled={pending || code.trim().length < 4}
          onClick={() => decide(false)}
        >
          <CircleSlash />
          Refuse
        </Button>
      </div>
    </form>
  );
}
