"use client";

import { useState } from "react";
import {
  ArrowRight,
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
import { useOrganizationId, useSession } from "@/lib/store";
import type { Tone } from "@/lib/tone";
import { useAction, useResource } from "@/lib/use-hub";
import {
  Empty,
  Field,
  Loading,
  Note,
  PageHeader,
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
  const { workspaceId, go } = useSession();
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
          <button
            type="button"
            className="text-foreground underline underline-offset-2"
            onClick={() => go("runs")}
          >
            Runs
          </button>{" "}
          shows what is executing, and{" "}
          <button
            type="button"
            className="text-foreground underline underline-offset-2"
            onClick={() => go("activity")}
          >
            Activity
          </button>{" "}
          shows what the workspace has been doing.
        </Empty>
      ) : null}

      {entries.length > 0 ? (
        <Panel>
          {entries.map((entry) => (
            <QueueRow key={entry.key} entry={entry} onDone={queue.reload} />
          ))}
        </Panel>
      ) : null}
    </>
  );
}

function QueueRow({ entry, onDone }: { entry: Intervention; onDone: () => void }) {
  const go = useSession((state) => state.go);
  const [pairing, setPairing] = useState(false);
  const kind = KIND[entry.kind];

  return (
    <div className="hover:bg-accent/40 flex items-stretch gap-3 px-4 py-3.5 transition-colors">
      <Stripe tone={kind.tone} live={entry.kind === "silent"} />
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
          {entry.target ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => go(entry.target!.screen, entry.target!.id)}
            >
              Open
              <ArrowRight />
            </Button>
          ) : null}
        </div>

        {pairing ? <PairMachine onDone={onDone} /> : null}
      </div>
    </div>
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
