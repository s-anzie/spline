import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Cpu,
  KeyRound,
  ListChecks,
  MessagesSquare,
  Receipt,
  ScrollText,
  ShieldCheck,
  Target,
} from "lucide-react";

import { routes } from "@/lib/routes";
import { Curves } from "@/components/public";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Spline — agents work on your machines",
  description:
    "A hub that holds the goals, the tasks and the record. Your computers do the work and report back. Nothing is dispatched without a person.",
};

/**
 * §6.3, §18.2 — how a machine comes to serve you, said plainly.
 *
 * Written against what the hub actually does. Every claim on this page is
 * something a reader can go and check on their own installation, which is the
 * only kind of claim worth making about a thing somebody self-hosts.
 */
const STEPS = [
  {
    icon: Cpu,
    title: "Pair a machine",
    body: "The worker runs on your computer and reaches out to the hub — the hub never reaches in. It prints a code; you approve that code from the console. Nobody who cannot read that screen can pair it.",
  },
  {
    icon: Target,
    title: "State a need",
    body: "A goal, in your own words, with what would make it done. Agents do not invent work: they wait for a need, and then they are autonomous in serving it.",
  },
  {
    icon: ListChecks,
    title: "Watch the work",
    body: "Tasks are assigned by name, run on a machine you chose, and come back with what changed, what it cost, and what is still blocked.",
  },
];

const GUARANTEES = [
  {
    icon: ShieldCheck,
    term: "One workspace at a time",
    detail:
      "No screen, no route and no query reads across two. Not a setting — there is no code path that can.",
  },
  {
    icon: KeyRound,
    term: "Credentials that expire",
    detail:
      "An agent's token is issued for one task, on one machine, for a while. Sign-in is a cookie the console itself cannot read.",
  },
  {
    icon: ScrollText,
    term: "A record, not a feeling",
    detail:
      "Every attempt is in the journal with its sequence, its actor and its cost. Nothing there was typed by a person.",
  },
  {
    icon: MessagesSquare,
    term: "A person in the loop",
    detail:
      "Work is dispatched by somebody. Validation is asked for, not assumed. An agent can delegate, and say it is blocked.",
  },
];

export default function Landing() {
  return (
    <>
      <section className="border-border/70 relative overflow-hidden border-b">
        <Curves className="-right-32 -bottom-40 size-[46rem]" />
        <div className="relative mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
          <p className="label mb-5">Self-hosted agent orchestration</p>
          <h1 className="max-w-3xl text-[2.5rem] leading-[1.1] font-semibold tracking-tight text-balance sm:text-[3.25rem]">
            Agents work on your machines. This is where you watch, and where you
            decide.
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-base leading-relaxed">
            The hub holds the goals, the tasks and the record. Your computers do
            the work and report back. Nothing is dispatched without a person,
            and nothing is ever read across two workspaces.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button size="lg" asChild>
              <Link href={routes.signUp}>
                Create an account
                <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={routes.signIn}>Sign in</Link>
            </Button>
          </div>
          <p className="text-muted-foreground mt-5 text-xs">
            Creating an account also creates the organization that will own your
            workspaces, your machines and your agents.
          </p>
        </div>
      </section>

      <section className="border-border/70 border-b">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="label mb-8">How it goes</h2>
          <ol className="grid gap-10 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <div className="mb-4 flex items-center gap-3">
                  <span className="border-border text-muted-foreground measure flex size-7 shrink-0 items-center justify-center rounded-full border text-xs">
                    {index + 1}
                  </span>
                  <step.icon className="text-signal size-4" strokeWidth={1.75} />
                </div>
                <h3 className="mb-2 text-sm font-medium">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-border/70 border-b">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="label mb-2">What it will not do</h2>
          <p className="text-muted-foreground mb-9 max-w-xl text-sm leading-relaxed">
            Four rules the hub enforces rather than documents. They are the
            reason it is worth handing a machine to.
          </p>
          <dl className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
            {GUARANTEES.map((guarantee) => (
              <div key={guarantee.term} className="flex gap-4">
                <guarantee.icon
                  className="text-muted-foreground mt-0.5 size-4 shrink-0"
                  strokeWidth={1.75}
                />
                <div>
                  <dt className="mb-1.5 text-sm font-medium">{guarantee.term}</dt>
                  <dd className="text-muted-foreground text-sm leading-relaxed">
                    {guarantee.detail}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="border-border bg-sidebar flex flex-col gap-6 rounded-xl border p-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-md">
            <h2 className="text-lg font-semibold tracking-tight">
              Your first machine takes about a minute.
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Create an account, run the worker on a computer you own, and
              approve the code it prints.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Receipt className="text-muted-foreground hidden size-4 sm:block" />
            <Button size="lg" asChild>
              <Link href={routes.signUp}>
                Get started
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
