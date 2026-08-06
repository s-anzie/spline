import { Cpu, KeyRound, Receipt } from "lucide-react";

import { Curves, Wordmark } from "@/components/public";

const CLAIMS = [
  {
    icon: Cpu,
    term: "Paired, not exposed",
    detail: "machines reach out to the hub; the hub never reaches in",
  },
  {
    icon: KeyRound,
    term: "Scoped to one job",
    detail: "an agent's token can do one thing, on one task, for a while",
  },
  {
    icon: Receipt,
    term: "Recorded",
    detail: "every attempt, its tokens, its cost, and what it changed",
  },
];

/**
 * The door.
 *
 * Two panes rather than a centred card: somebody arriving at a hub they were
 * handed a link to should be able to tell what this is before they type a
 * password into it. The left pane is the same argument the landing page
 * makes, compressed — it is shared by signing in and signing up because the
 * question a stranger has is the same either way.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="bg-sidebar border-sidebar-border relative hidden flex-col justify-between overflow-hidden border-r px-14 py-12 lg:flex">
        <Curves className="-right-24 -bottom-24 size-[34rem]" />

        <Wordmark />

        <div className="relative max-w-lg">
          <p className="label mb-4">The console</p>
          <h1 className="text-[2.125rem] leading-[1.15] font-semibold tracking-tight text-balance">
            Agents work on your machines.
            <br />
            This is where you watch, and where you decide.
          </h1>
          <p className="text-muted-foreground mt-5 max-w-md text-sm leading-relaxed">
            The hub holds the goals, the tasks and the record. Your computers do
            the work and report back. Nothing is dispatched without a person,
            and nothing is ever read across two workspaces.
          </p>
        </div>

        <dl className="relative grid grid-cols-3 gap-6">
          {CLAIMS.map((claim) => (
            <div key={claim.term}>
              <claim.icon
                className="text-muted-foreground mb-2 size-4"
                strokeWidth={1.75}
              />
              <dt className="mb-1 text-xs font-medium">{claim.term}</dt>
              <dd className="text-muted-foreground text-xs leading-relaxed">
                {claim.detail}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex items-center justify-center px-8 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-9 lg:hidden">
            <Wordmark />
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}
