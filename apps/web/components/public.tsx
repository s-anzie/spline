import Link from "next/link";

import { routes } from "@/lib/routes";
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
 * The same three curves as the console's sign-in pane, drawn very quietly.
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

export function PublicHeader() {
  return (
    <header className="border-border/70 sticky top-0 z-20 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Wordmark />
        <nav className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href={routes.signIn}>Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href={routes.signUp}>Create an account</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-border/70 border-t">
      <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-8 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p>
          Spline — a hub, and the machines that answer to it. Self-hosted; it
          listens on loopback until you decide otherwise.
        </p>
        <div className="flex gap-4">
          <Link href={routes.signIn} className="hover:text-foreground transition-colors">
            Sign in
          </Link>
          <Link href={routes.signUp} className="hover:text-foreground transition-colors">
            Create an account
          </Link>
        </div>
      </div>
    </footer>
  );
}
