"use client";

import { useSession } from "@/lib/store";
import { SignIn } from "@/components/sign-in";
import { WorkspacePicker } from "@/components/workspace-picker";
import { InterventionQueue } from "@/components/intervention-queue";
import { Shell } from "@/components/shell";

/**
 * One page, three states — signed out, no workspace chosen, working.
 *
 * A router would let somebody land on a screen with no session and see it
 * flash before redirecting. §4.2 makes the workspace mandatory for every
 * read, so there is no meaningful screen before one is chosen.
 */
export default function Home() {
  const { email, workspaceId } = useSession();

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
      <InterventionQueue />
    </Shell>
  );
}
