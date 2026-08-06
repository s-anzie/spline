"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import { useSession } from "@/lib/store";
import { useAction } from "@/lib/use-hub";
import { Field, Note } from "@/components/kit";
import { Button } from "@/components/ui/button";

/**
 * Where to go once there is a session.
 *
 * `?next=` is carried by the console when it sends somebody here, so a link
 * to a task survives the detour through signing in. It is checked to be a
 * path on this site: an unchecked one turns this form into an open redirect,
 * which is how a phishing page gets to wear your domain in the address bar.
 */
function landingAfter(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return routes.queue;
}

/**
 * Somebody who is already signed in has no business on these pages.
 *
 * The session is picked back up from the cookie on load, so this runs after
 * `restore()` rather than instead of it — otherwise a reload of `/sign-in`
 * would sit on the form for the length of one request before deciding.
 */
function useAlreadyIn(next: string | null): void {
  const { email, restored, restore } = useSession();
  const router = useRouter();

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    if (restored && email) {
      router.replace(landingAfter(next));
    }
  }, [restored, email, next, router]);
}

export function SignInForm() {
  const next = useSearchParams().get("next");
  const router = useRouter();
  const { logIn, loading, error } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  useAlreadyIn(next);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void logIn(email.trim(), password).then((ok) => {
          if (ok) router.replace(landingAfter(next));
        });
      }}
    >
      <h2 className="text-lg font-semibold tracking-tight">Sign in</h2>
      <p className="text-muted-foreground mt-1.5 mb-7 text-sm leading-relaxed">
        This browser stays signed in. What it keeps is a cookie the console
        itself cannot read, good for one thing — asking the hub for a new
        token. The token that can actually do anything never leaves this tab.
      </p>

      <div className="space-y-4">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoFocus
        />
        <Field label="Password" type="password" value={password} onChange={setPassword} />
      </div>

      {error ? (
        <div className="mt-4">
          <Note>{error}</Note>
        </div>
      ) : null}

      <Button type="submit" className="mt-6 w-full" disabled={loading || !email || !password}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        No account yet?{" "}
        <Link
          href={next ? `${routes.signUp}?next=${encodeURIComponent(next)}` : routes.signUp}
          className="text-foreground underline underline-offset-4"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm() {
  const next = useSearchParams().get("next");
  const router = useRouter();
  const { logIn, loading, error } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { run, pending, error: refusal } = useAction();
  useAlreadyIn(next);

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
      () =>
        void logIn(email.trim(), password).then((ok) => {
          if (ok) router.replace(landingAfter(next));
        }),
    );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        register();
      }}
    >
      <h2 className="text-lg font-semibold tracking-tight">Create an account</h2>
      <p className="text-muted-foreground mt-1.5 mb-7 text-sm leading-relaxed">
        This also creates the organization that will own your workspaces, your
        machines and your agents.
      </p>

      <div className="space-y-4">
        <Field
          label="Your name"
          value={displayName}
          onChange={setDisplayName}
          placeholder="Ada Lovelace"
          autoFocus
        />
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
        />
        <Field label="Password" type="password" value={password} onChange={setPassword} />
        <p className="text-muted-foreground -mt-1 text-xs leading-relaxed">
          At least 12 characters. It is the only thing standing between a
          stranger and your machines.
        </p>
      </div>

      {error ?? refusal ? (
        <div className="mt-4">
          <Note>{error ?? refusal}</Note>
        </div>
      ) : null}

      <Button
        type="submit"
        className="mt-6 w-full"
        disabled={loading || pending || !email || !password || !displayName.trim()}
      >
        {loading || pending ? "Creating…" : "Create account"}
      </Button>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        Already have one?{" "}
        <Link
          href={next ? `${routes.signIn}?next=${encodeURIComponent(next)}` : routes.signIn}
          className="text-foreground underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
