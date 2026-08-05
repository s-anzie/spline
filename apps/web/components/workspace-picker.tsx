"use client";

import { useSession } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * §4.2 — isolation is absolute, so every screen is scoped to one workspace
 * and there is no "all workspaces" view to offer.
 */
export function WorkspacePicker() {
  const { workspaces, chooseWorkspace } = useSession();

  if (workspaces.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No workspace yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm" style={{ color: "var(--muted)" }}>
          Create one from the hub, then reload. A workspace is where every
          other thing here lives.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium" style={{ color: "var(--muted)" }}>
        Choose a workspace
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {workspaces.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            onClick={() => chooseWorkspace(workspace.id)}
            className="rounded-xl border p-4 text-left transition hover:shadow-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <span className="block font-medium">{workspace.name}</span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {workspace.status.toLowerCase()}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
