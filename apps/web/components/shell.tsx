"use client";

import { useSession } from "@/lib/store";
import { Button } from "@/components/ui/button";

/** The frame every signed-in screen sits in. */
export function Shell({ children }: { children: React.ReactNode }) {
  const { email, workspaceId, workspaces, chooseWorkspace, logOut } = useSession();
  const current = workspaces.find((w) => w.id === workspaceId);

  return (
    <div className="min-h-screen">
      <header
        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-6 py-3"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <span className="text-sm font-semibold tracking-tight">Spline</span>
        {current ? (
          <button
            type="button"
            onClick={() => chooseWorkspace(null)}
            className="rounded-md px-2 py-1 text-sm hover:underline"
            aria-label={`Workspace ${current.name} — choose another`}
            style={{ color: "var(--muted)" }}
          >
            {current.name} ↓
          </button>
        ) : null}
        <span className="ml-auto text-sm" style={{ color: "var(--muted)" }}>
          {email}
        </span>
        <Button variant="ghost" size="sm" onClick={logOut}>
          Sign out
        </Button>
      </header>
      <main className="mx-auto w-full max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
