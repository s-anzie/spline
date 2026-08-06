"use client";

import { useState } from "react";
import { ArrowRight, Cpu, KeyRound, Receipt } from "lucide-react";

import { api } from "@/lib/api";
import { useSession } from "@/lib/store";
import { useAction } from "@/lib/use-hub";
import { Field, Note } from "@/components/kit";
import { Button } from "@/components/ui/button";

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
 * password into it.
 */
export function SignIn() {
  const { logIn, loading, error } = useSession();
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const { run, pending, error: refusal } = useAction();

  /**
   * Registering creates the account AND the organization that owns everything
   * it will ever make — then signs in with the same credentials, because
   * asking somebody to type a password twice in a row to reach the same place
   * is a form we can simply not show.
   */
  const register = () =>
    void run(
      () =>
        api.auth.register({
          email: email.trim(),
          password,
          displayName: displayName.trim(),
        }),
      () => void logIn(email.trim(), password),
    );

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="bg-sidebar border-sidebar-border relative hidden flex-col justify-between overflow-hidden border-r px-14 py-12 lg:flex">
        {/* The curve the product is named for, drawn very quietly. */}
        <svg
          aria-hidden
          viewBox="0 0 400 400"
          className="text-foreground pointer-events-none absolute -right-24 -bottom-24 size-[34rem] opacity-[0.055]"
        >
          <path
            d="M10 340C90 340 90 60 200 60s110 280 190 280"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M10 300C90 300 90 100 200 100s110 200 190 200"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M10 380C90 380 90 20 200 20s110 360 190 360"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>

        <div className="flex items-center gap-2">
          <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
            <path
              d="M2.5 15.5C6 15.5 6 4.5 10 4.5s4 11 7.5 11"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity="0.45"
            />
            <circle cx="2.5" cy="15.5" r="1.6" fill="currentColor" opacity="0.45" />
            <circle cx="17.5" cy="15.5" r="1.6" fill="currentColor" opacity="0.45" />
            <circle cx="10" cy="4.5" r="2.1" fill="var(--signal)" />
          </svg>
          <span className="text-[0.9375rem] font-semibold tracking-tight">Spline</span>
        </div>

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
        <form
          className="w-full max-w-sm"
          onSubmit={(event) => {
            event.preventDefault();
            if (creating) register();
            else void logIn(email, password);
          }}
        >
          <h2 className="text-lg font-semibold tracking-tight">
            {creating ? "Create an account" : "Sign in"}
          </h2>
          <p className="text-muted-foreground mt-1.5 mb-7 text-sm leading-relaxed">
            {creating
              ? "This also creates the organization that will own your workspaces, your machines and your agents."
              : "The session lives in this tab only — closing it signs you out. That is deliberate: a token in local storage is a token any script on this origin can read."}
          </p>

          <div className="space-y-4">
            {creating ? (
              <Field
                label="Your name"
                value={displayName}
                onChange={setDisplayName}
                placeholder="Ada Lovelace"
                autoFocus
              />
            ) : null}
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              autoFocus={!creating}
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
            />
          </div>

          {error ?? refusal ? (
            <div className="mt-4">
              <Note>{error ?? refusal}</Note>
            </div>
          ) : null}

          <Button
            type="submit"
            className="mt-6 w-full"
            disabled={
              loading ||
              pending ||
              !email ||
              !password ||
              (creating && !displayName.trim())
            }
          >
            {loading || pending
              ? creating
                ? "Creating…"
                : "Signing in…"
              : creating
                ? "Create account"
                : "Sign in"}
            {loading || pending ? null : <ArrowRight />}
          </Button>

          <button
            type="button"
            onClick={() => setCreating((mode) => !mode)}
            className="text-muted-foreground hover:text-foreground mt-4 w-full text-center text-xs transition-colors"
          >
            {creating
              ? "I already have an account"
              : "No account yet? Create one"}
          </button>
        </form>
      </section>
    </div>
  );
}
