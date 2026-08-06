"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { routes } from "@/lib/routes";
import { useSession } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * The pieces every page outside the console shares.
 *
 * Kept apart from `shell.tsx` on purpose: the console's frame assumes a
 * session, a workspace and a rail, and none of that exists yet on the pages
 * somebody sees before they have an account.
 */

/** The curve the product is named for. */
export function Spool({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={cn("size-5", className)} aria-hidden>
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
  );
}

export function Wordmark({ href = routes.home }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <Spool />
      <span className="text-[0.9375rem] font-semibold tracking-tight">Spline</span>
    </Link>
  );
}

/**
 * The same three curves as the door's left pane, drawn very quietly.
 * Decoration, so it is hidden from anything that reads the page aloud.
 */
export function Curves({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 400"
      className={cn(
        "text-foreground pointer-events-none absolute opacity-[0.055]",
        className,
      )}
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
  );
}

/**
 * Whether this browser already has a session, and one attempt to find out.
 *
 * The public pages have to ask: offering "Sign in" to somebody who is signed
 * in is the kind of small wrongness that makes a site feel like it is not
 * paying attention. The answer costs one request against the cookie the hub
 * set — the console cannot read that cookie itself, so there is no cheaper
 * way to know.
 */
function useVisitor(): { known: boolean; signedIn: boolean; name: string | null } {
  const { email, displayName, restored, restore } = useSession();

  useEffect(() => {
    void restore();
  }, [restore]);

  return { known: restored, signedIn: Boolean(email), name: displayName ?? email };
}

/**
 * What to offer, once we know who is asking.
 *
 * Until the answer lands, a placeholder of the same size holds the space.
 * Rendering the signed-out buttons first would mean flashing "create an
 * account" at somebody who has one; rendering nothing would move the header
 * as the page settles.
 */
export function VisitorActions({ size = "sm" }: { size?: "sm" | "lg" }) {
  const { known, signedIn } = useVisitor();
  const big = size === "lg";

  if (!known) {
    return (
      <div
        aria-hidden
        className={cn(
          "bg-muted/60 animate-pulse rounded-md",
          big ? "h-11 w-64" : "h-8 w-52",
        )}
      />
    );
  }

  if (signedIn) {
    return (
      <Button size={big ? "lg" : "sm"} asChild>
        <Link href={routes.queue}>
          Open the console
          <ArrowRight />
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant={big ? "outline" : "ghost"} size={big ? "lg" : "sm"} asChild>
        <Link href={routes.signIn}>Sign in</Link>
      </Button>
      <Button size={big ? "lg" : "sm"} asChild>
        <Link href={routes.signUp}>
          Create an account
          {big ? <ArrowRight /> : null}
        </Link>
      </Button>
    </div>
  );
}

export function PublicHeader() {
  return (
    <header className="border-border/70 bg-background/85 sticky top-0 z-20 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Wordmark />
        <VisitorActions />
      </div>
    </header>
  );
}

export function PublicFooter() {
  const { known, signedIn } = useVisitor();

  return (
    <footer className="border-border/70 border-t">
      <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-8 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md leading-relaxed">
          Spline — a hub, and the machines that answer to it. Self-hosted; it
          listens on loopback until you decide otherwise.
        </p>
        {known ? (
          <div className="flex gap-5">
            {signedIn ? (
              <Link
                href={routes.queue}
                className="hover:text-foreground transition-colors"
              >
                Open the console
              </Link>
            ) : (
              <>
                <Link
                  href={routes.signIn}
                  className="hover:text-foreground transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href={routes.signUp}
                  className="hover:text-foreground transition-colors"
                >
                  Create an account
                </Link>
              </>
            )}
          </div>
        ) : null}
      </div>
    </footer>
  );
}
