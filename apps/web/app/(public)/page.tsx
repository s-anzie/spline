import type { Metadata } from "next";
import { ArrowRight, Ban } from "lucide-react";

import { cn } from "@/lib/utils";
import { Curves, VisitorActions } from "@/components/public";

export const metadata: Metadata = {
  title: "Spline — agents work on your machines",
  description:
    "A hub that holds the goals, the tasks and the record. Your computers do the work and report back. Nothing is dispatched without a person.",
};

/**
 * The page a stranger meets.
 *
 * Written to show the product rather than adjectives about it. Everything on
 * it is the console's own material — the journal's sequence numbers, the
 * pairing code a worker prints, the severity stripe, the mono face that this
 * design system reserves for anything a machine measured. A page that
 * described "powerful orchestration" in three columns of icons would be about
 * any product; this one can only be about this one.
 *
 * Every claim is checkable on an installation, which is the only kind of
 * claim worth making about software somebody hosts themselves.
 */

/** One line of the journal, in the console's own shape. */
function Fact({
  sequence,
  type,
  detail,
  tone,
}: {
  sequence: string;
  type: string;
  detail: string;
  tone: "signal" | "waiting" | "live" | "settled";
}) {
  return (
    <div className="hover:bg-accent/30 flex items-stretch gap-3 px-4 py-2 transition-colors">
      <span
        aria-hidden
        className="w-0.5 shrink-0 rounded-full"
        style={{ background: `var(--${tone})` }}
      />
      <span className="measure min-w-0 flex-1 truncate text-[0.8125rem]">{type}</span>
      <span className="text-muted-foreground hidden min-w-0 flex-1 truncate text-xs sm:block">
        {detail}
      </span>
      <span className="measure text-muted-foreground/70 shrink-0 text-[0.6875rem]">
        {sequence}
      </span>
    </div>
  );
}

/** A workspace's first hour, told by the record it leaves behind. */
const FIRST_HOUR = [
  {
    sequence: "1774",
    type: "identity.credential_issued",
    detail: "agent · Reviewer",
    tone: "settled" as const,
  },
  {
    sequence: "1781",
    type: "runtime.enrolment_decided",
    detail: "machine · thinkpad-x1",
    tone: "settled" as const,
  },
  {
    sequence: "1786",
    type: "goal.created",
    detail: "move authentication to OIDC",
    tone: "live" as const,
  },
  {
    sequence: "1790",
    type: "task.assigned",
    detail: "Reviewer · 3 of 7",
    tone: "live" as const,
  },
  {
    sequence: "1794",
    type: "run.started",
    detail: "thinkpad-x1 · claude",
    tone: "live" as const,
  },
  {
    sequence: "1801",
    type: "run.completed",
    detail: "4m 12s · 38.4k tokens",
    tone: "settled" as const,
  },
  {
    sequence: "1802",
    type: "task.submitted",
    detail: "waiting for a person",
    tone: "waiting" as const,
  },
];

const RULES = [
  {
    rule: "No screen reads two workspaces.",
    why: "Not a setting and not a role — there is no route, no query and no aggregation that crosses. The one place it would have been convenient was refused.",
  },
  {
    rule: "An agent's token expires.",
    why: "It is issued for one task, on one machine, for a while. Signing in is a cookie the console itself cannot read, rotated every time it is used.",
  },
  {
    rule: "Nothing starts by itself.",
    why: "Agents do not invent work. A person states a need; dispatch is an act somebody performs. Validation is asked for, never assumed.",
  },
  {
    rule: "Nothing is quietly deleted.",
    why: "The journal is append-only and ordered by a sequence, not a timestamp. What an agent did is on record with its actor, its cost and its target.",
  },
];

export default function Landing() {
  return (
    <>
      {/* ── The thesis, beside the thing itself ─────────────────────────── */}
      <section className="border-border/70 relative overflow-hidden border-b">
        <Curves className="-top-40 -right-52 size-[52rem]" />
        <div className="relative mx-auto grid w-full max-w-6xl gap-14 px-6 py-20 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:py-28">
          <div>
            <p className="label text-muted-foreground mb-6">
              Self-hosted agent orchestration
            </p>
            <h1 className="text-[2.5rem] leading-[1.06] font-semibold tracking-[-0.02em] text-balance sm:text-[3.25rem]">
              Agents work on your machines.
              <span className="text-muted-foreground block">
                This is where you watch, and where you decide.
              </span>
            </h1>
            <p className="text-muted-foreground mt-7 max-w-md text-[0.9375rem] leading-relaxed">
              The hub holds the goals, the tasks and the record. Your computers
              do the work and report back. Nothing is dispatched without a
              person, and nothing is ever read across two workspaces.
            </p>
            <div className="mt-9">
              <VisitorActions size="lg" />
            </div>
            <p className="text-muted-foreground mt-5 text-xs leading-relaxed">
              An account also creates the organization that will own your
              workspaces, your machines and your agents.
            </p>
          </div>

          <figure className="min-w-0">
            <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
              <div className="border-border/70 flex items-center justify-between border-b px-4 py-2.5">
                <span className="label text-muted-foreground">Activity</span>
                <span className="measure text-muted-foreground/70 text-[0.6875rem]">
                  workspace · payments
                </span>
              </div>
              <div className="divide-border/60 divide-y">
                {FIRST_HOUR.map((fact) => (
                  <Fact key={fact.sequence} {...fact} />
                ))}
              </div>
            </div>
            <figcaption className="text-muted-foreground mt-3 text-xs leading-relaxed">
              A workspace&rsquo;s first hour, as the journal records it. Nothing
              on that list was typed by a person — the last line is the one
              asking for one.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ── The shape of it. This is the claim people check first. ──────── */}
      <section className="border-border/70 border-b">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="label text-muted-foreground mb-9">Which way the wire runs</h2>
          <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
            <Node
              title="Your machine"
              lines={["runs the worker", "holds the CLIs and the code"]}
            />
            <Wire label="dials out" />
            <Node
              title="The hub"
              lines={["goals, tasks, the record", "decides nothing on its own"]}
              accent
            />
            <Wire label="reads" reversed />
            <Node title="You" lines={["the console", "states needs, approves work"]} />
          </div>
          <p className="text-muted-foreground mt-9 max-w-2xl text-sm leading-relaxed">
            The arrows only ever point inward. The hub never opens a connection
            to your computer, so nothing on it has to be exposed, port-forwarded
            or trusted to a tunnel — and a machine you unplug simply stops
            reporting.
          </p>
        </div>
      </section>

      {/* ── Three moments, each shown in the product's own material ─────── */}
      <section className="border-border/70 border-b">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="label text-muted-foreground mb-9">From nothing to working</h2>
          <div className="grid gap-10 lg:grid-cols-3">
            <Step
              step="First"
              title="Pair a machine"
              body="The worker prints a code. You approve that code from the console, as the owner of the organization it asked to join. Nobody who cannot read that screen can pair it, and it is listed to nobody else."
            >
              <pre className="border-border bg-card text-muted-foreground overflow-x-auto rounded-lg border px-4 py-3 text-[0.75rem] leading-relaxed">
                <code className="measure">{`  This machine is not paired yet.

    machine:  thinkpad-x1
    can run:  claude, codex

    PAIRING CODE:  Q6YWCJ19`}</code>
              </pre>
            </Step>

            <Step
              step="Then"
              title="State a need"
              body="A goal in your own words, and what would make it done. The decomposition into tasks comes after — it is not your job to invent it."
            >
              <div className="border-border bg-card rounded-lg border px-4 py-3.5">
                <p className="label text-muted-foreground mb-2">Success means</p>
                <ul className="space-y-1.5 text-[0.8125rem] leading-relaxed">
                  <li className="flex gap-2">
                    <span className="text-settled">✓</span>
                    <span>no session in progress is cut</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-settled">✓</span>
                    <span>our own password login still works</span>
                  </li>
                  <li className="text-muted-foreground flex gap-2">
                    <span>·</span>
                    <span>a person checks these before it is called done</span>
                  </li>
                </ul>
              </div>
            </Step>

            <Step
              step="After that"
              title="Watch the work"
              body="Tasks are assigned by name and run on a machine you chose. What comes back is what changed, what it cost, and what it is still blocked on."
            >
              <div className="border-border bg-card divide-border/60 divide-y rounded-lg border">
                <Fact
                  sequence="1794"
                  type="run.started"
                  detail="thinkpad-x1"
                  tone="live"
                />
                <Fact
                  sequence="1801"
                  type="run.completed"
                  detail="4m 12s · 38.4k"
                  tone="settled"
                />
                <Fact
                  sequence="1802"
                  type="task.submitted"
                  detail="needs a verdict"
                  tone="waiting"
                />
              </div>
            </Step>
          </div>
        </div>
      </section>

      {/* ── Two floors. The model, not a feature list. ──────────────────── */}
      <section className="border-border/70 border-b">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-16 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div>
            <h2 className="label text-muted-foreground mb-4">Two floors</h2>
            <p className="text-lg leading-snug font-medium tracking-tight text-balance">
              A machine belongs to your organization. A workspace only borrows
              it.
            </p>
            <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
              Pairing binds a computer to the organization that owns it. Serving
              a workspace is a second, deliberate act — which is why a colleague
              can be given a workspace without being given your fleet, and why
              &ldquo;your machines&rdquo; means one set of computers no matter
              which screen you are standing on.
            </p>
          </div>

          <div className="border-border bg-card overflow-hidden rounded-xl border">
            <Floor
              name="Organization"
              hint="what you own"
              items={["Machines", "Agent identities", "Workspaces", "Billing of record"]}
            />
            <Floor
              name="Workspace"
              hint="what the work happens in"
              items={["Goals and tasks", "Runs", "Conversations", "Memory", "The journal"]}
              nested
            />
          </div>
        </div>
      </section>

      {/* ── The refusals. Stated as rules, because they are enforced. ───── */}
      <section className="border-border/70 border-b">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="label text-muted-foreground mb-2">What it will not do</h2>
          <p className="text-muted-foreground mb-10 max-w-xl text-sm leading-relaxed">
            Four rules the hub enforces rather than documents. They are the
            reason it is worth handing a machine to.
          </p>
          <dl className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {RULES.map((rule) => (
              <div key={rule.rule} className="flex gap-3.5">
                <Ban
                  className="text-muted-foreground/60 mt-0.5 size-4 shrink-0"
                  strokeWidth={1.75}
                />
                <div>
                  <dt className="mb-1.5 text-sm font-medium">{rule.rule}</dt>
                  <dd className="text-muted-foreground text-sm leading-relaxed">
                    {rule.why}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="flex flex-col items-start gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-lg">
            <h2 className="text-2xl leading-tight font-semibold tracking-tight text-balance">
              Your first machine takes about a minute.
            </h2>
            <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
              Run the worker on a computer you own, approve the code it
              prints, and state the first need. Everything after that is on the
              record.
            </p>
          </div>
          <VisitorActions size="lg" />
        </div>
      </section>
    </>
  );
}

function Node({
  title,
  lines,
  accent,
}: {
  title: string;
  lines: string[];
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-card relative overflow-hidden rounded-lg border px-4 py-3.5",
        accent ? "border-signal/35" : "border-border",
      )}
    >
      {/* A hairline along the top rather than a wash behind the text: the
          emphasis has to survive both themes, and a tinted panel that reads as
          "highlighted" in the dark reads as "stained" in the light. */}
      {accent ? (
        <span
          aria-hidden
          className="bg-signal absolute inset-x-0 top-0 h-px opacity-70"
        />
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      {lines.map((line) => (
        <p key={line} className="text-muted-foreground mt-1 text-xs leading-relaxed">
          {line}
        </p>
      ))}
    </div>
  );
}

/**
 * The arrow, and the word on it. Rotated a quarter turn on narrow screens so
 * the row becomes a column without the arrows pointing sideways into nothing.
 */
function Wire({ label, reversed }: { label: string; reversed?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1 sm:flex-col sm:py-0">
      <span className="label text-muted-foreground/80 sm:order-1">{label}</span>
      <ArrowRight
        className={cn(
          "text-muted-foreground/50 size-4 shrink-0 rotate-90 sm:rotate-0",
          reversed && "rotate-[270deg] sm:rotate-180",
        )}
        strokeWidth={1.75}
      />
    </div>
  );
}

function Floor({
  name,
  hint,
  items,
  nested,
}: {
  name: string;
  hint: string;
  items: string[];
  nested?: boolean;
}) {
  return (
    <div className={cn("p-5", nested && "border-border/70 bg-muted/30 border-t")}>
      <div className={cn(nested && "border-border ml-4 border-l pl-5")}>
        <div className="mb-3 flex items-baseline gap-2.5">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-muted-foreground text-xs">{hint}</span>
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li
              key={item}
              className="border-border/70 text-muted-foreground rounded-md border px-2 py-1 text-xs"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Step({
  step,
  title,
  body,
  children,
}: {
  step: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="label text-muted-foreground/70 mb-2">{step}</p>
      <h3 className="mb-2.5 text-base font-medium tracking-tight">{title}</h3>
      <p className="text-muted-foreground mb-5 text-sm leading-relaxed">{body}</p>
      {children}
    </div>
  );
}
