"use client";

import { useSession } from "@/lib/store";
import { Shell } from "@/components/shell";
import { SignIn } from "@/components/sign-in";
import { WorkspacePicker } from "@/components/workspace-picker";
import { Activity } from "@/components/screens/activity";
import { Goals } from "@/components/screens/goals";
import { Inbox } from "@/components/screens/inbox";
import { Machines } from "@/components/screens/machines";
import { Queue } from "@/components/screens/queue";
import { Runs } from "@/components/screens/runs";
import { Tasks } from "@/components/screens/tasks";
import { WorkspaceScreen } from "@/components/screens/workspace";

/**
 * One address, three gates: signed out, no workspace chosen, working.
 *
 * The screens are switched here rather than by a router because the access
 * token lives in memory (`lib/hub.ts`) — a URL that survives a reload but
 * cannot load is worse than no URL at all. `route` in the store is what a
 * router's path would have been.
 */
export default function Console() {
  const { email, workspaceId, route } = useSession();

  if (!email) {
    return <SignIn />;
  }
  if (!workspaceId) {
    return (
      <Shell>
        <WorkspacePicker />
      </Shell>
    );
  }

  return (
    <Shell>
      {route.screen === "queue" ? <Queue /> : null}
      {route.screen === "goals" ? <Goals /> : null}
      {route.screen === "tasks" ? <Tasks /> : null}
      {route.screen === "runs" ? <Runs /> : null}
      {route.screen === "machines" ? <Machines /> : null}
      {route.screen === "activity" ? <Activity /> : null}
      {route.screen === "inbox" ? <Inbox /> : null}
      {route.screen === "workspace" ? <WorkspaceScreen /> : null}
    </Shell>
  );
}
